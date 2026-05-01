import { NextResponse } from 'next/server'
import { getDemoDB, DEMO_PASSWORDS, DEMO_ADMIN_PASSWORD, IS_DEMO } from '@/lib/demo'
import type { AttendanceEvent, AttendanceEventType } from '@/types/db'
import { cancelLastEvent } from '@/lib/attendance'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!IS_DEMO) {
    return NextResponse.json({ error: 'Demo mode is not enabled' }, { status: 403 })
  }

  const { action, ...params } = await request.json()
  const db = getDemoDB()

  switch (action) {
    // ---- AUTH ----
    case 'login-user': {
      const { empId, password } = params
      const emp = db.employees.find(e => e.id === empId && e.status === 'active')
      if (!emp || DEMO_PASSWORDS[empId] !== password) {
        return NextResponse.json({ error: '社員IDまたはパスワードが正しくありません' }, { status: 401 })
      }
      db.session = { type: 'user', empId, name: emp.name }
      return NextResponse.json({ success: true, employee: emp })
    }

    case 'login-admin': {
      const { password } = params
      if (password !== DEMO_ADMIN_PASSWORD) {
        return NextResponse.json({ error: '管理者パスワードが正しくありません' }, { status: 401 })
      }
      db.session = { type: 'admin', name: 'Admin' }
      return NextResponse.json({ success: true })
    }

    case 'logout': {
      db.session = null
      return NextResponse.json({ success: true })
    }

    case 'get-session': {
      return NextResponse.json({ session: db.session })
    }

    // ---- EMPLOYEE ----
    case 'get-employee': {
      const emp = db.employees.find(e => e.id === params.empId)
      return NextResponse.json({ data: emp || null })
    }

    case 'get-employees': {
      const statusFilter = params.status || 'active'
      const list = db.employees.filter(e => statusFilter === 'all' || e.status === statusFilter)
      return NextResponse.json({ data: list })
    }

    case 'create-employee': {
      const newEmp = params.employee
      db.employees.push(newEmp)
      DEMO_PASSWORDS[newEmp.id] = params.password || 'pass'
      return NextResponse.json({ success: true })
    }

    case 'update-employee': {
      const idx = db.employees.findIndex(e => e.id === params.empId)
      if (idx >= 0) {
        db.employees[idx] = { ...db.employees[idx], ...params.updates, updated_at: new Date().toISOString() }
      }
      return NextResponse.json({ success: true })
    }

    case 'reset-password': {
      const idx2 = db.employees.findIndex(e => e.id === params.empId)
      if (idx2 >= 0) {
        db.employees[idx2].first_login = true
        db.employees[idx2].pw_reset_at = new Date().toISOString()
        DEMO_PASSWORDS[params.empId] = params.newPassword
      }
      return NextResponse.json({ success: true })
    }

    case 'change-password': {
      const { empId, currentPassword, newPassword } = params
      if (DEMO_PASSWORDS[empId] !== currentPassword) {
        return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 400 })
      }
      DEMO_PASSWORDS[empId] = newPassword
      const empIdx = db.employees.findIndex(e => e.id === empId)
      if (empIdx >= 0) {
        db.employees[empIdx].pw_changed_at = new Date().toISOString()
        db.employees[empIdx].first_login = false
      }
      return NextResponse.json({ success: true })
    }

    // ---- ATTENDANCE ----
    case 'clock': {
      const { empId, type } = params as { empId: string; type: AttendanceEventType }
      const now = new Date()
      const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

      let rec = db.attendance.find(a => a.emp_id === empId && a.date === dateStr)
      const newEvent: AttendanceEvent = { type, time: now.toISOString(), source: 'clock' }

      if (rec) {
        rec.events = [...rec.events, newEvent]
        rec.updated_at = now.toISOString()
      } else {
        rec = {
          id: `demo-${Date.now()}`, emp_id: empId, date: dateStr,
          events: [newEvent], note: '', admin_note: null,
          admin_note_updated_at: null, admin_note_by: null,
          modified_by: null, modified_at: null,
          created_at: now.toISOString(), updated_at: now.toISOString(),
        }
        db.attendance.push(rec)
      }
      return NextResponse.json({ success: true, events: rec.events })
    }

    case 'cancel': {
      const { empId, type: cancelType } = params
      const now2 = new Date()
      const dateStr2 = now2.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
      const rec2 = db.attendance.find(a => a.emp_id === empId && a.date === dateStr2)
      if (!rec2) {
        return NextResponse.json({ error: '本日の打刻がありません' }, { status: 400 })
      }
      const result = cancelLastEvent(rec2.events, cancelType)
      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 })
      }
      rec2.events = result.events
      return NextResponse.json({ success: true, message: result.message, events: result.events })
    }

    case 'get-attendance': {
      const { empId, startDate, endDate } = params
      const recs = db.attendance.filter(a => {
        if (empId && a.emp_id !== empId) return false
        if (startDate && a.date < startDate) return false
        if (endDate && a.date > endDate) return false
        return true
      })
      return NextResponse.json({ data: recs })
    }

    case 'update-attendance': {
      const rec3 = db.attendance.find(a => a.emp_id === params.empId && a.date === params.date)
      if (rec3) {
        if (params.events) rec3.events = params.events
        if (params.note !== undefined) rec3.note = params.note
        if (params.admin_note !== undefined) {
          rec3.admin_note = params.admin_note
          rec3.admin_note_updated_at = new Date().toISOString()
          rec3.admin_note_by = 'admin'
        }
        if (params.modified_by) {
          rec3.modified_by = params.modified_by
          rec3.modified_at = new Date().toISOString()
        }
      }
      return NextResponse.json({ success: true })
    }

    // ---- CORRECTION REQUESTS ----
    case 'submit-correction': {
      const cr = {
        id: `CR-${Date.now()}`,
        emp_id: params.empId, emp_name: params.empName,
        date: params.date, requested_events: params.requestedEvents,
        reason: params.reason, status: 'pending' as const,
        submitted_at: new Date().toISOString(),
        reviewed_at: null, reviewed_by: null,
        withdrawn_at: null, reject_reason: null,
        created_at: new Date().toISOString(),
      }
      db.correction_requests.push(cr)
      return NextResponse.json({ success: true, data: cr })
    }

    case 'get-corrections': {
      let list2 = db.correction_requests
      if (params.empId) list2 = list2.filter(c => c.emp_id === params.empId)
      if (params.status) list2 = list2.filter(c => c.status === params.status)
      return NextResponse.json({ data: list2.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)) })
    }

    case 'withdraw-correction': {
      const cr2 = db.correction_requests.find(c => c.id === params.id && c.status === 'pending')
      if (cr2) {
        cr2.status = 'withdrawn'
        cr2.withdrawn_at = new Date().toISOString()
      }
      return NextResponse.json({ success: true })
    }

    case 'approve-correction': {
      const cr3 = db.correction_requests.find(c => c.id === params.id)
      if (cr3) {
        cr3.status = 'approved'
        cr3.reviewed_at = new Date().toISOString()
        cr3.reviewed_by = 'admin'
        // attendance に反映
        const attRec = db.attendance.find(a => a.emp_id === cr3.emp_id && a.date === cr3.date)
        if (attRec) {
          attRec.events = cr3.requested_events
          attRec.modified_by = 'admin'
          attRec.modified_at = new Date().toISOString()
        }
      }
      return NextResponse.json({ success: true })
    }

    case 'reject-correction': {
      const cr4 = db.correction_requests.find(c => c.id === params.id)
      if (cr4) {
        cr4.status = 'rejected'
        cr4.reviewed_at = new Date().toISOString()
        cr4.reviewed_by = 'admin'
        cr4.reject_reason = params.reason || ''
      }
      return NextResponse.json({ success: true })
    }

    // ---- LEAVE REQUESTS ----
    case 'submit-leave': {
      const lr = {
        id: `LR-${Date.now()}`,
        emp_id: params.empId, emp_name: params.empName,
        type: params.type, from_date: params.fromDate, to_date: params.toDate,
        reason: params.reason || null,
        status: 'pending' as const,
        submitted_at: new Date().toISOString(),
        reviewed_at: null, reviewed_by: null,
        withdrawn_at: null, reject_reason: null,
        created_at: new Date().toISOString(),
      }
      db.leave_requests.push(lr)
      return NextResponse.json({ success: true, data: lr })
    }

    case 'get-leaves': {
      let list3 = db.leave_requests
      if (params.empId) list3 = list3.filter(l => l.emp_id === params.empId)
      if (params.status) list3 = list3.filter(l => l.status === params.status)
      return NextResponse.json({ data: list3.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)) })
    }

    case 'withdraw-leave': {
      const lr2 = db.leave_requests.find(l => l.id === params.id && l.status === 'pending')
      if (lr2) {
        lr2.status = 'withdrawn'
        lr2.withdrawn_at = new Date().toISOString()
      }
      return NextResponse.json({ success: true })
    }

    case 'approve-leave': {
      const lr3 = db.leave_requests.find(l => l.id === params.id)
      if (lr3) {
        lr3.status = 'approved'
        lr3.reviewed_at = new Date().toISOString()
        lr3.reviewed_by = 'admin'
      }
      return NextResponse.json({ success: true })
    }

    case 'reject-leave': {
      const lr4 = db.leave_requests.find(l => l.id === params.id)
      if (lr4) {
        lr4.status = 'rejected'
        lr4.reviewed_at = new Date().toISOString()
        lr4.reviewed_by = 'admin'
        lr4.reject_reason = params.reason || ''
      }
      return NextResponse.json({ success: true })
    }

    // ---- SETTINGS ----
    case 'get-settings': {
      return NextResponse.json({ data: db.settings })
    }

    case 'update-settings': {
      Object.assign(db.settings, params.updates, { updated_at: new Date().toISOString() })
      return NextResponse.json({ success: true })
    }

    case 'change-admin-password': {
      // Demo mode: just update the constant
      return NextResponse.json({ success: true })
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }
}
