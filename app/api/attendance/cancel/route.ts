import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'
import { cancelLastEvent } from '@/lib/attendance'
import type { AttendanceEvent, AttendanceEventType } from '@/types/db'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const empId = await verifyUserSession()
    if (!empId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { type } = await request.json() as { type: AttendanceEventType }

    const supabase = supabaseAdmin()
    const now = new Date()
    const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

    const { data: existing } = await supabase
      .from('attendance')
      .select('id, events')
      .eq('emp_id', empId)
      .eq('date', dateStr)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: '本日の打刻がありません' }, { status: 400 })
    }

    const result = cancelLastEvent(existing.events as AttendanceEvent[], type)
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }

    const { error } = await supabase
      .from('attendance')
      .update({ events: result.events })
      .eq('id', existing.id)

    if (error) {
      return NextResponse.json({ error: 'キャンセルの保存に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: result.message, events: result.events })
  } catch {
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
