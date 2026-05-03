import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface UpdateBody {
  new_id?: string
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

function authEmail(empId: string): string {
  return `${empId.toLowerCase()}@b-attendance.local`
}

export async function PATCH(
  request: Request,
  { params }: { params: { empId: string } }
) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  try {
    let empId = params.empId
    const body = (await request.json()) as UpdateBody
    const admin = supabaseAdmin()

    const { data: existing } = await admin
      .from('employees').select('auth_user_id').eq('id', empId).maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: '従業員が見つかりません' }, { status: 404 })
    }

    // 1. パスワードリセット（単独操作）。
    // service_role の updateUserById が成功した時点でパスワードは確実に反映済み。
    // 別途のサインインテストは Supabase の Email プロバイダ設定に依存して
    // 偽陰性を出すため行わない。
    if (body.reset_password) {
      if (!existing.auth_user_id) {
        return NextResponse.json({ error: 'auth_user_id が紐づいていません' }, { status: 400 })
      }
      if (body.reset_password.length < 4) {
        return NextResponse.json({ error: '新パスワードは4文字以上で入力してください' }, { status: 400 })
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
        return NextResponse.json({ error: 'first_login 更新失敗: ' + empError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // 2. ID 変更（先に処理。以降の更新は新IDに対して行う）
    if (body.new_id) {
      const newId = body.new_id.trim()
      if (newId !== empId) {
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(newId)) {
          return NextResponse.json({ error: '社員IDは英数字（大小区別）/ハイフン/アンダースコア 1〜32文字で入力してください' }, { status: 400 })
        }
        const { data: dup } = await admin
          .from('employees').select('id').eq('id', newId).maybeSingle()
        if (dup) {
          return NextResponse.json({ error: '同じ社員IDが既に存在します' }, { status: 409 })
        }

        // employees.id を新IDへ。FK の ON UPDATE CASCADE が必須（migration SQL で設定）
        const { error: idError } = await admin
          .from('employees').update({ id: newId }).eq('id', empId)
        if (idError) {
          return NextResponse.json({
            error: 'ID 変更失敗: ' + idError.message + ' （FK の ON UPDATE CASCADE が必要）',
          }, { status: 500 })
        }

        // Auth ユーザーのメール + app_metadata.emp_id も更新
        if (existing.auth_user_id) {
          const { error: emailError } = await admin.auth.admin.updateUserById(existing.auth_user_id, {
            email: authEmail(newId),
            app_metadata: { role: 'user', emp_id: newId },
          })
          if (emailError) {
            return NextResponse.json({
              error: 'employees の ID は更新されましたが Auth ユーザー更新に失敗: ' + emailError.message,
            }, { status: 500 })
          }
        }

        empId = newId
      }
    }

    // 3. 通常編集
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
      // 通常項目に変更が無い場合（ID変更だけの場合など）も成功として返す
      return NextResponse.json({ success: true, id: empId })
    }

    const { error } = await admin.from('employees').update(updates).eq('id', empId)
    if (error) {
      return NextResponse.json({ error: '更新失敗: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, id: empId })
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
    // ソフト削除（status='inactive'）。Auth ユーザーは残すのでログイン履歴も保持
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
