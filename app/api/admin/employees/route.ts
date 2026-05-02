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

export async function POST(request: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as CreateBody
    const { id, password, name, kana, birthday, dept, position, paid_leave_total, paid_leave_used } = body

    if (!id || !password || !name) {
      return NextResponse.json({ error: '社員ID、パスワード、氏名は必須です' }, { status: 400 })
    }

    const admin = supabaseAdmin()

    // 既存チェック
    const { data: existing } = await admin
      .from('employees').select('id').eq('id', id).maybeSingle()
    if (existing) {
      return NextResponse.json({ error: '同じ社員IDが既に存在します' }, { status: 409 })
    }

    // Supabase Auth ユーザー作成
    const email = `${id}@b-attendance.local`
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: 'user', emp_id: id },
    })
    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: 'Supabase Authユーザー作成に失敗しました: ' + (authError?.message || '') },
        { status: 500 }
      )
    }

    // employees テーブルへの行追加
    const { error: empError } = await admin.from('employees').insert({
      id, auth_user_id: authUser.user.id,
      name,
      kana: kana || null,
      birthday: birthday || null,
      dept: dept || null,
      position: position || null,
      status: 'active',
      paid_leave_total: paid_leave_total ?? 10,
      paid_leave_used: paid_leave_used ?? 0,
      first_login: true,
    })
    if (empError) {
      // Auth ユーザー作ったあとの失敗なのでロールバック
      await admin.auth.admin.deleteUser(authUser.user.id)
      return NextResponse.json(
        { error: 'employees 行追加に失敗しました: ' + empError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, employee: { id, name } })
  } catch (e) {
    return NextResponse.json({ error: '処理でエラーが発生しました: ' + String(e) }, { status: 500 })
  }
}
