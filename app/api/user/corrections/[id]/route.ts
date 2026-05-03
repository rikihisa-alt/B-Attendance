import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const empId = await verifyUserSession()
  if (!empId) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const { action } = (await request.json()) as { action?: string }
    if (action !== 'withdraw') {
      return NextResponse.json({ error: '対応していない操作です' }, { status: 400 })
    }
    const admin = supabaseAdmin()
    const { data: cr } = await admin
      .from('correction_requests')
      .select('id, emp_id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (!cr || cr.emp_id !== empId) {
      return NextResponse.json({ error: '対象の申請が見つかりません' }, { status: 404 })
    }
    if (cr.status !== 'pending') {
      return NextResponse.json({ error: '承認待ち以外は取り下げできません' }, { status: 400 })
    }
    const { error } = await admin.from('correction_requests').update({
      status: 'withdrawn',
      withdrawn_at: new Date().toISOString(),
    }).eq('id', params.id)
    if (error) {
      return NextResponse.json({ error: '取下げに失敗しました: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
