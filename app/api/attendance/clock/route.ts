import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'
import type { AttendanceEvent, AttendanceEventType } from '@/types/db'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const empId = await verifyUserSession()
    if (!empId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { type } = await request.json() as { type: AttendanceEventType }
    const validTypes: AttendanceEventType[] = ['in', 'out', 'break_start', 'break_end']
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: '無効な打刻タイプです' }, { status: 400 })
    }

    const supabase = supabaseAdmin()
    const now = new Date()
    const dateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

    const { data: existing } = await supabase
      .from('attendance')
      .select('id, events')
      .eq('emp_id', empId)
      .eq('date', dateStr)
      .maybeSingle()

    const newEvent: AttendanceEvent = {
      type,
      time: now.toISOString(),
      source: 'clock',
    }

    if (existing) {
      const events = [...(existing.events as AttendanceEvent[]), newEvent]
      const { error } = await supabase
        .from('attendance')
        .update({ events })
        .eq('id', existing.id)

      if (error) {
        return NextResponse.json({ error: '打刻の保存に失敗しました' }, { status: 500 })
      }

      return NextResponse.json({ success: true, events })
    } else {
      const events = [newEvent]
      const { error } = await supabase
        .from('attendance')
        .insert({ emp_id: empId, date: dateStr, events })

      if (error) {
        return NextResponse.json({ error: '打刻の保存に失敗しました' }, { status: 500 })
      }

      return NextResponse.json({ success: true, events })
    }
  } catch {
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
