import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { setAdminSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { id, password } = await request.json()

    if (!password) {
      return NextResponse.json({ error: 'パスワードを入力してください' }, { status: 400 })
    }

    const { data: settings, error } = await supabaseAdmin()
      .from('settings')
      .select('admin_id, admin_password_hash')
      .eq('id', 1)
      .single()

    if (error || !settings) {
      return NextResponse.json({ error: 'システム設定の取得に失敗しました' }, { status: 500 })
    }

    const storedId = settings.admin_id
    if (storedId && id !== storedId) {
      await logAudit({
        actorType: 'admin', actorId: id || null, action: 'login_failed',
        afterData: { reason: 'id_mismatch' }, request,
      })
      return NextResponse.json({ error: '管理者IDまたはパスワードが正しくありません' }, { status: 401 })
    }

    const isValid = await bcrypt.compare(password, settings.admin_password_hash)
    if (!isValid) {
      await logAudit({
        actorType: 'admin', actorId: id || storedId || null, action: 'login_failed',
        afterData: { reason: 'password_mismatch' }, request,
      })
      return NextResponse.json({ error: '管理者IDまたはパスワードが正しくありません' }, { status: 401 })
    }

    await setAdminSession()
    await logAudit({
      actorType: 'admin', actorId: storedId || id || 'admin', action: 'login', request,
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '認証処理でエラーが発生しました' }, { status: 500 })
  }
}
