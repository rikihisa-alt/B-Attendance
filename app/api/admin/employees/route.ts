import { NextResponse } from 'next/server'
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
  paid_leave_total?: number
  paid_leave_used?: number
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
    const email = authEmail(empId)
    const { data: usersList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    const dupAuth = usersList?.users.find(u => u.email?.toLowerCase() === email)
    if (dupAuth) {
      return NextResponse.json({
        error: '同じメールアドレスの Auth ユーザーが既に存在します（過去の作成失敗の残骸の可能性）'
      }, { status: 409 })
    }

    // Auth ユーザー作成
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'user', emp_id: empId },
    })
    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: 'Authユーザー作成失敗: ' + (authError?.message || 'unknown') },
        { status: 500 }
      )
    }

    // employees 行追加
    const { error: empError } = await admin.from('employees').insert({
      id: empId,
      auth_user_id: authUser.user.id,
      name,
      kana: body.kana || null,
      birthday: body.birthday || null,
      dept: body.dept || null,
      position: body.position || null,
      status: 'active',
      paid_leave_total: body.paid_leave_total ?? 10,
      paid_leave_used: body.paid_leave_used ?? 0,
      first_login: true,
    })
    if (empError) {
      // ロールバック
      await admin.auth.admin.deleteUser(authUser.user.id)
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
