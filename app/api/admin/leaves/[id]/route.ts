import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'
import type { LeaveRequest } from '@/types/db'

export const runtime = 'nodejs'

interface PatchBody {
  action: 'approve' | 'reject'
  reject_reason?: string
}

function leaveDays(l: LeaveRequest): number {
  if (l.type === 'paid_am' || l.type === 'paid_pm') return 0.5
  const from = new Date(l.from_date)
  const to = new Date(l.to_date)
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as PatchBody
    const id = params.id
    const admin = supabaseAdmin()

    const { data: leave } = await admin
      .from('leave_requests').select('*').eq('id', id).maybeSingle()
    if (!leave) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
    }
    const l = leave as LeaveRequest
    if (l.status !== 'pending') {
      return NextResponse.json({ error: '承認待ち以外の申請は処理できません' }, { status: 400 })
    }

    if (body.action === 'approve') {
      const now = new Date().toISOString()
      const { error: upErr } = await admin.from('leave_requests').update({
        status: 'approved',
        reviewed_at: now,
        reviewed_by: 'admin',
      }).eq('id', id)
      if (upErr) {
        return NextResponse.json({ error: '承認失敗: ' + upErr.message }, { status: 500 })
      }
      // 有給の場合は paid_leave_used を加算
      if (l.type.startsWith('paid')) {
        const { data: emp } = await admin
          .from('employees').select('paid_leave_used').eq('id', l.emp_id).maybeSingle()
        if (emp) {
          await admin.from('employees').update({
            paid_leave_used: (emp.paid_leave_used || 0) + leaveDays(l),
          }).eq('id', l.emp_id)
        }
      }
      return NextResponse.json({ success: true })
    }

    if (body.action === 'reject') {
      if (!body.reject_reason?.trim()) {
        return NextResponse.json({ error: '却下理由を入力してください' }, { status: 400 })
      }
      const { error } = await admin.from('leave_requests').update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
        reject_reason: body.reject_reason.trim(),
      }).eq('id', id)
      if (error) {
        return NextResponse.json({ error: '却下失敗: ' + error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'action が不正です' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
