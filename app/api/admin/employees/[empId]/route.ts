import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface UpdateBody {
  name?: string
  kana?: string | null
  birthday?: string | null
  dept?: string | null
  position?: string | null
  status?: 'active' | 'inactive'
  paid_leave_total?: number
  paid_leave_used?: number
  reset_password?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: { empId: string } }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const empId = params.empId
    const body = (await request.json()) as UpdateBody
    const admin = supabaseAdmin()

    const { data: existing } = await admin
      .from('employees').select('auth_user_id').eq('id', empId).maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: '従業員が見つかりません' }, { status: 404 })
    }

    // パスワードリセット
    if (body.reset_password) {
      if (!existing.auth_user_id) {
        return NextResponse.json({ error: 'auth_user_id が紐づいていません' }, { status: 400 })
      }
      const { error: pwError } = await admin.auth.admin.updateUserById(existing.auth_user_id, {
        password: body.reset_password,
      })
      if (pwError) {
        return NextResponse.json({ error: 'パスワードリセット失敗: ' + pwError.message }, { status: 500 })
      }
      const { error: empError } = await admin
        .from('employees').update({
          first_login: true,
          pw_reset_at: new Date().toISOString(),
        }).eq('id', empId)
      if (empError) {
        return NextResponse.json({ error: 'first_login更新失敗: ' + empError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // 通常の編集
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.kana !== undefined) updates.kana = body.kana
    if (body.birthday !== undefined) updates.birthday = body.birthday
    if (body.dept !== undefined) updates.dept = body.dept
    if (body.position !== undefined) updates.position = body.position
    if (body.status !== undefined) updates.status = body.status
    if (body.paid_leave_total !== undefined) updates.paid_leave_total = body.paid_leave_total
    if (body.paid_leave_used !== undefined) updates.paid_leave_used = body.paid_leave_used

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
    }

    const { error } = await admin.from('employees').update(updates).eq('id', empId)
    if (error) {
      return NextResponse.json({ error: '更新失敗: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { empId: string } }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    const empId = params.empId
    const admin = supabaseAdmin()
    const { data: existing } = await admin
      .from('employees').select('auth_user_id').eq('id', empId).maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: '従業員が見つかりません' }, { status: 404 })
    }
    // employees の物理削除は ON DELETE で attendance も一緒に消えるリスクがあるので
    // status='inactive' に切り替えるソフト削除を採用。Auth ユーザーだけ無効化したい場合は管理者が個別対応。
    const { error } = await admin
      .from('employees').update({ status: 'inactive' }).eq('id', empId)
    if (error) {
      return NextResponse.json({ error: '退職処理失敗: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
