import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { setUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { empId, password } = (await request.json()) as { empId?: string; password?: string }
    const id = empId?.trim()
    if (!id || !password) {
      return NextResponse.json({ error: '社員IDとパスワードを入力してください' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: emp, error } = await admin
      .from('employees')
      .select('id, name, password_hash, status, first_login')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: '従業員情報の取得に失敗しました: ' + error.message }, { status: 500 })
    }
    if (!emp) {
      return NextResponse.json({ error: '社員IDまたはパスワードが正しくありません' }, { status: 401 })
    }
    if (emp.status !== 'active') {
      return NextResponse.json({ error: 'このアカウントは現在利用できません（退職処理済み）' }, { status: 403 })
    }
    if (!emp.password_hash) {
      return NextResponse.json({
        error: 'パスワードが未設定です。管理者にパスワードリセットを依頼してください。',
      }, { status: 401 })
    }

    const ok = await bcrypt.compare(password, emp.password_hash)
    if (!ok) {
      return NextResponse.json({ error: '社員IDまたはパスワードが正しくありません' }, { status: 401 })
    }

    await setUserSession(emp.id)
    return NextResponse.json({
      success: true,
      employee: { id: emp.id, name: emp.name, first_login: emp.first_login },
    })
  } catch (e) {
    return NextResponse.json({ error: '認証処理でエラーが発生しました: ' + String(e) }, { status: 500 })
  }
}
