import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

// 従業員のログイン関連状態を診断する。
// employees 行と Supabase Auth ユーザーの整合をチェックし、ズレがあれば指摘する。
export async function GET(
  _request: Request,
  { params }: { params: { empId: string } }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  const empId = params.empId.toUpperCase()
  const admin = supabaseAdmin()

  const result: Record<string, unknown> = { empId, issues: [] as string[] }
  const issues = result.issues as string[]

  // 1. employees 行
  const { data: emp } = await admin.from('employees').select('*').eq('id', empId).maybeSingle()
  result.employees_row = emp || null
  if (!emp) issues.push('employees テーブルに該当行なし')

  // 2. Auth ユーザー（auth_user_id 経由）
  let authUser: unknown = null
  if (emp?.auth_user_id) {
    const { data, error } = await admin.auth.admin.getUserById(emp.auth_user_id)
    if (error) issues.push('auth_user_id の Auth ユーザー取得失敗: ' + error.message)
    authUser = data?.user || null
  } else if (emp) {
    issues.push('employees.auth_user_id が NULL')
  }
  result.auth_user = authUser

  // 3. メールから Auth ユーザーを引いて整合確認
  const expectedEmail = `${empId}@b-attendance.local`.toLowerCase()
  // 全ユーザー走査して該当メールを探す（admin.users.list はページング）
  const { data: usersList, error: listError } = await admin.auth.admin.listUsers({
    page: 1, perPage: 200,
  })
  if (listError) issues.push('Authユーザー一覧取得失敗: ' + listError.message)
  const matchByEmail = usersList?.users.find(u => u.email?.toLowerCase() === expectedEmail)
  result.auth_user_by_email = matchByEmail
    ? { id: matchByEmail.id, email: matchByEmail.email, app_metadata: matchByEmail.app_metadata, email_confirmed_at: matchByEmail.email_confirmed_at, last_sign_in_at: matchByEmail.last_sign_in_at }
    : null

  if (matchByEmail && emp && matchByEmail.id !== emp.auth_user_id) {
    issues.push(`auth_user_id 不整合: employees=${emp.auth_user_id}, auth.users=${matchByEmail.id}`)
  }
  if (!matchByEmail && emp) {
    issues.push(`Auth ユーザーが email=${expectedEmail} で見つからない`)
  }
  if (matchByEmail && !matchByEmail.email_confirmed_at) {
    issues.push('Auth ユーザーの email_confirmed_at が NULL（メール確認未完）')
  }
  if (matchByEmail && !matchByEmail.app_metadata?.emp_id) {
    issues.push('Auth ユーザーの app_metadata.emp_id が未設定')
  }
  if (matchByEmail && matchByEmail.app_metadata?.emp_id !== empId) {
    issues.push(`app_metadata.emp_id 不整合: ${matchByEmail.app_metadata?.emp_id} (期待値 ${empId})`)
  }

  return NextResponse.json(result)
}
