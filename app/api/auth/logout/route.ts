import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clearAdminSession, clearUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST() {
  try {
    // 念のため Supabase 側のセッションもクリア（残っていれば）
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // Supabase 側は失敗しても無視
    }

    await clearAdminSession()
    await clearUserSession()

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'ログアウトに失敗しました' }, { status: 500 })
  }
}
