import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface CreateBody {
  id: string
  password: string
  name: string
  kana?: string | null
  birthday?: string | null
  dept?: string | null
  position?: string | null
}

function authEmail(empId: string): string {
  // Supabase Auth はメールを小文字正規化するので最初から小文字で揃える
  return `${empId.toLowerCase()}@b-attendance.local`
}

export async function POST(request: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as CreateBody
    const empId = body.id?.trim()
    const password = body.password
    const name = body.name?.trim()

    if (!empId || !password || !name) {
      return NextResponse.json({ error: '社員ID、パスワード、氏名は必須です' }, { status: 400 })
    }
    if (password.length < 4) {
      return NextResponse.json({ error: '初期パスワードは4文字以上で入力してください' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // 既存チェック
    const { data: existingEmp } = await admin
      .from('employees').select('id').eq('id', empId).maybeSingle()
    if (existingEmp) {
      return NextResponse.json({ error: '同じ社員IDが既に存在します' }, { status: 409 })
    }
    // Supabase Auth ユーザー作成は best-effort（Email プロバイダ無効時は失敗するが、
    // 本来のログインは employees.password_hash を見るので致命傷ではない）
    let authUserId: string | null = null
    const email = authEmail(empId)
    const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const dupAuth = usersList?.users.find(u => u.email?.toLowerCase() === email)
    if (dupAuth) {
      // 既存 Auth ユーザーを再利用（過去の作成失敗の残骸と仮定）
      authUserId = dupAuth.id
    } else {
      const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: 'user', emp_id: empId },
      })
      if (authError) {
        // 失敗してもログ程度。employees 側で完結する。
        console.warn('Auth ユーザー作成失敗（employees.password_hash で代替）:', authError.message)
      } else if (authUser?.user) {
        authUserId = authUser.user.id
      }
    }

    // 従業員ログイン用 bcrypt ハッシュ（こちらが正本）
    const passwordHash = await bcrypt.hash(password, 10)

    // employees 行追加
    const { error: empError } = await admin.from('employees').insert({
      id: empId,
      auth_user_id: authUserId,
      name,
      kana: body.kana || null,
      birthday: body.birthday || null,
      dept: body.dept || null,
      position: body.position || null,
      status: 'active',
      first_login: true,
      password_hash: passwordHash,
    })
    if (empError) {
      // employees 行追加に失敗したら Auth 側の作り損ないをロールバック
      if (authUserId && !dupAuth) {
        await admin.auth.admin.deleteUser(authUserId).catch(() => null)
      }
      return NextResponse.json(
        { error: 'employees行追加失敗: ' + empError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, employee: { id: empId, name } })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
