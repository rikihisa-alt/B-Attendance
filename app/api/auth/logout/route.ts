import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clearAdminSession } from '@/lib/auth'

export async function POST() {
  try {
    // Supabase ユーザーセッションをクリア
    const supabase = createClient()
    await supabase.auth.signOut()

    // 管理者セッションもクリア
    await clearAdminSession()

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'ログアウトに失敗しました' }, { status: 500 })
  }
}
