import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { setAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: 'パスワードを入力してください' }, { status: 400 })
    }

    // settings テーブルから管理者パスワードハッシュを取得
    const { data: settings, error } = await supabaseAdmin()
      .from('settings')
      .select('admin_password_hash')
      .eq('id', 1)
      .single()

    if (error || !settings) {
      return NextResponse.json({ error: 'システム設定の取得に失敗しました' }, { status: 500 })
    }

    const isValid = await bcrypt.compare(password, settings.admin_password_hash)
    if (!isValid) {
      return NextResponse.json({ error: '管理者パスワードが正しくありません' }, { status: 401 })
    }

    // JWTを発行してcookieに保存
    await setAdminSession()

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '認証処理でエラーが発生しました' }, { status: 500 })
  }
}
