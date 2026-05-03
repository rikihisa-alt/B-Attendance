import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const empId = await verifyUserSession()
    if (!empId) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const body = (await request.json()) as { currentPassword?: string; newPassword?: string }
    const currentPassword = body.currentPassword
    const newPassword = body.newPassword
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '現在のパスワードと新しいパスワードを入力してください' }, { status: 400 })
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ error: '新しいパスワードは4文字以上で入力してください' }, { status: 400 })
    }
    if (newPassword === currentPassword) {
      return NextResponse.json({ error: '現在のパスワードと異なるものを設定してください' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: emp, error } = await admin
      .from('employees')
      .select('id, password_hash')
      .eq('id', empId)
      .maybeSingle()
    if (error || !emp) {
      return NextResponse.json({ error: '従業員情報の取得に失敗しました' }, { status: 500 })
    }
    if (!emp.password_hash) {
      return NextResponse.json({ error: 'パスワードが未設定です。管理者に連絡してください。' }, { status: 400 })
    }

    const ok = await bcrypt.compare(currentPassword, emp.password_hash)
    if (!ok) {
      return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 401 })
    }

    const newHash = await bcrypt.hash(newPassword, 10)
    const { error: updateError } = await admin
      .from('employees')
      .update({
        password_hash: newHash,
        first_login: false,
        pw_changed_at: new Date().toISOString(),
      })
      .eq('id', empId)
    if (updateError) {
      return NextResponse.json({ error: 'パスワード更新に失敗しました: ' + updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
