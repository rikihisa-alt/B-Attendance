import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

// 本人の名前/カナ/誕生日を更新
export async function PATCH(request: Request) {
  const empId = await verifyUserSession()
  if (!empId) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as {
      name?: string
      kana?: string | null
      birthday?: string | null
    }
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const n = body.name.trim()
      if (!n) {
        return NextResponse.json({ error: '氏名は必須です' }, { status: 400 })
      }
      updates.name = n
    }
    if (body.kana !== undefined) updates.kana = body.kana || null
    if (body.birthday !== undefined) updates.birthday = body.birthday || null
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true })
    }

    const admin = supabaseAdmin()
    const { error } = await admin.from('employees').update(updates).eq('id', empId)
    if (error) {
      return NextResponse.json({ error: '更新失敗: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
