import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'
import type { AttendanceEvent } from '@/types/db'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const empId = await verifyUserSession()
  if (!empId) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as {
      date: string
      requested_events: AttendanceEvent[]
      reason: string
    }
    if (!body.date || !Array.isArray(body.requested_events) || !body.reason) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
    }
    const admin = supabaseAdmin()
    const { data: emp } = await admin
      .from('employees').select('name').eq('id', empId).maybeSingle()
    const { error } = await admin.from('correction_requests').insert({
      emp_id: empId,
      emp_name: emp?.name || empId,
      date: body.date,
      requested_events: body.requested_events,
      reason: body.reason,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    })
    if (error) {
      return NextResponse.json({ error: '修正申請の登録に失敗しました: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
