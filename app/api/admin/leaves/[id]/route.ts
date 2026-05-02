import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'
import type { LeaveRequest } from '@/types/db'

export const runtime = 'nodejs'

interface PatchBody {
  action: 'approve' | 'reject'
  reject_reason?: string
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
      // employees.paid_leave_used は移行時の基準値で、承認のたびに増やさない。
      // 残日数の計算は employees.paid_leave_used + 承認済 paid_* の合計 を引いて算出する
      // （v_paid_leave_summary ビューと同じ計算式）。
      const { error: upErr } = await admin.from('leave_requests').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
      }).eq('id', id)
      if (upErr) {
        return NextResponse.json({ error: '承認失敗: ' + upErr.message }, { status: 500 })
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
