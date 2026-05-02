import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

// employees 行と Auth ユーザーの整合をチェックして、可能なら自動修復する
// - employees.auth_user_id がメール一致のユーザーUUIDと違う → employees 側を更新
// - Auth ユーザーの app_metadata.emp_id が空または不一致 → Auth 側を更新
// - email_confirmed_at が NULL → 強制 confirm
export async function POST(
  _request: Request,
  { params }: { params: { empId: string } }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  const empId = params.empId.toUpperCase()
  const admin = supabaseAdmin()
  const fixed: string[] = []

  const { data: emp } = await admin.from('employees').select('*').eq('id', empId).maybeSingle()
  if (!emp) {
    return NextResponse.json({ error: 'employees 行が見つかりません' }, { status: 404 })
  }

  // メールから Auth ユーザーを引く
  const expectedEmail = `${empId.toLowerCase()}@b-attendance.local`
  const { data: usersList, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listError) {
    return NextResponse.json({ error: 'Authユーザー一覧取得失敗: ' + listError.message }, { status: 500 })
  }
  const authUser = usersList?.users.find(u => u.email?.toLowerCase() === expectedEmail)
  if (!authUser) {
    return NextResponse.json({
      error: `email=${expectedEmail} の Auth ユーザーが存在しません。退職にして作り直してください。`
    }, { status: 404 })
  }

  // 1. employees.auth_user_id を Auth UUID に揃える
  if (emp.auth_user_id !== authUser.id) {
    const { error } = await admin
      .from('employees').update({ auth_user_id: authUser.id }).eq('id', empId)
    if (error) {
      return NextResponse.json({ error: 'auth_user_id 修復失敗: ' + error.message }, { status: 500 })
    }
    fixed.push(`employees.auth_user_id を ${authUser.id} に更新`)
  }

  // 2. Auth ユーザーの app_metadata.emp_id を empId に揃える
  const meta = (authUser.app_metadata || {}) as Record<string, unknown>
  if (meta.emp_id !== empId || meta.role !== 'user') {
    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      app_metadata: { ...meta, role: 'user', emp_id: empId },
    })
    if (error) {
      return NextResponse.json({ error: 'app_metadata 修復失敗: ' + error.message }, { status: 500 })
    }
    fixed.push(`Auth ユーザーの app_metadata.emp_id を ${empId} に更新`)
  }

  // 3. email_confirmed_at が NULL なら強制 confirm
  if (!authUser.email_confirmed_at) {
    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      email_confirm: true,
    })
    if (error) {
      return NextResponse.json({ error: 'email_confirm 修復失敗: ' + error.message }, { status: 500 })
    }
    fixed.push('email を強制確認済みに更新')
  }

  return NextResponse.json({ success: true, fixed })
}
