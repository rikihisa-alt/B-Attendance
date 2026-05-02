import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'
import type { CorrectionRequest, AttendanceEvent } from '@/types/db'

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

    const { data: req } = await admin
      .from('correction_requests').select('*').eq('id', id).maybeSingle()
    if (!req) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 })
    }
    const r = req as CorrectionRequest
    if (r.status !== 'pending') {
      return NextResponse.json({ error: '承認待ち以外の申請は処理できません' }, { status: 400 })
    }

    if (body.action === 'approve') {
      // attendance.events を申請内容で上書き、modified_by/at を記録
      const events = r.requested_events as AttendanceEvent[]
      const { data: existing } = await admin
        .from('attendance').select('*')
        .eq('emp_id', r.emp_id).eq('date', r.date).maybeSingle()
      const now = new Date().toISOString()
      if (existing) {
        const { error } = await admin.from('attendance').update({
          events,
          modified_by: 'admin',
          modified_at: now,
        }).eq('emp_id', r.emp_id).eq('date', r.date)
        if (error) {
          return NextResponse.json({ error: 'attendance更新失敗: ' + error.message }, { status: 500 })
        }
      } else {
        const { error } = await admin.from('attendance').insert({
          emp_id: r.emp_id, date: r.date, events,
          note: '', modified_by: 'admin', modified_at: now,
        })
        if (error) {
          return NextResponse.json({ error: 'attendance挿入失敗: ' + error.message }, { status: 500 })
        }
      }
      const { error: rUpdErr } = await admin.from('correction_requests').update({
        status: 'approved',
        reviewed_at: now,
        reviewed_by: 'admin',
      }).eq('id', id)
      if (rUpdErr) {
        return NextResponse.json({ error: '申請ステータス更新失敗: ' + rUpdErr.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    if (body.action === 'reject') {
      if (!body.reject_reason?.trim()) {
        return NextResponse.json({ error: '却下理由を入力してください' }, { status: 400 })
      }
      const { error } = await admin.from('correction_requests').update({
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
