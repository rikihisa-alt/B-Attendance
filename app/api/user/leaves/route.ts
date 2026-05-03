import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'
import type { LeaveType } from '@/types/db'

export const runtime = 'nodejs'

// 休暇申請を新規作成
export async function POST(request: Request) {
  const empId = await verifyUserSession()
  if (!empId) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as {
      type: LeaveType
      from_date: string
      to_date: string
      reason?: string | null
    }
    if (!body.type || !body.from_date || !body.to_date) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
    }
    const admin = supabaseAdmin()
    const { data: emp } = await admin
      .from('employees').select('name').eq('id', empId).maybeSingle()
    const { error } = await admin.from('leave_requests').insert({
      emp_id: empId,
      emp_name: emp?.name || empId,
      type: body.type,
      from_date: body.from_date,
      to_date: body.to_date,
      reason: body.reason || null,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    })
    if (error) {
      return NextResponse.json({ error: '休暇申請の登録に失敗しました: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
