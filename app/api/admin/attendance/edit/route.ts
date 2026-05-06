// 管理者: 申請を経ずに勤怠 (events) を直接編集する。
// 修正内容は audit_log に before/after を残す。
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import type { AttendanceEvent, AttendanceEventType, AttendanceEventSource } from '@/types/db'

export const runtime = 'nodejs'

interface PostBody {
  emp_id: string
  date: string
  events: Array<{
    type: AttendanceEventType
    time: string  // ISO
    source?: AttendanceEventSource
    cancelled?: boolean
    cancelledAt?: string
    note?: string
  }>
}

const VALID_TYPES: AttendanceEventType[] = ['in', 'out', 'break_start', 'break_end']

export async function POST(request: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as PostBody
    if (!body.emp_id || !body.date || !Array.isArray(body.events)) {
      return NextResponse.json({ error: 'emp_id / date / events は必須です' }, { status: 400 })
    }
    for (const ev of body.events) {
      if (!VALID_TYPES.includes(ev.type)) {
        return NextResponse.json({ error: '打刻タイプが不正です: ' + ev.type }, { status: 400 })
      }
      if (!ev.time || isNaN(new Date(ev.time).getTime())) {
        return NextResponse.json({ error: '時刻が不正です' }, { status: 400 })
      }
    }

    const admin = supabaseAdmin()
    const now = new Date().toISOString()

    // 既存行を取得 (before として audit_log に残す)
    const { data: existing } = await admin
      .from('attendance').select('id, events')
      .eq('emp_id', body.emp_id).eq('date', body.date).maybeSingle()

    const normalized: AttendanceEvent[] = body.events.map(ev => ({
      type: ev.type,
      time: new Date(ev.time).toISOString(),
      source: ev.source || 'admin-edit',
      ...(ev.cancelled ? { cancelled: true, cancelledAt: ev.cancelledAt || now } : {}),
      ...(ev.note ? { note: ev.note } : {}),
    }))

    if (existing) {
      const { error } = await admin.from('attendance').update({
        events: normalized,
        modified_by: 'admin',
        modified_at: now,
      }).eq('emp_id', body.emp_id).eq('date', body.date)
      if (error) {
        return NextResponse.json({ error: '更新失敗: ' + error.message }, { status: 500 })
      }
    } else {
      const { error } = await admin.from('attendance').insert({
        emp_id: body.emp_id,
        date: body.date,
        events: normalized,
        note: '',
        modified_by: 'admin',
        modified_at: now,
      })
      if (error) {
        return NextResponse.json({ error: '挿入失敗: ' + error.message }, { status: 500 })
      }
    }

    await logAudit({
      actorType: 'admin',
      action: 'attendance_edit',
      targetType: 'attendance',
      targetId: `${body.emp_id}:${body.date}`,
      beforeData: existing ? { events: existing.events } : null,
      afterData: { events: normalized },
      request,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
