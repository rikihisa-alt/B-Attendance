import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface UpdateBody {
  company_name?: string
  standard_work_hours?: number
  standard_work_days?: number
  work_start_time?: string
  work_end_time?: string
  monthly_overtime_limit?: number
  yearly_overtime_limit?: number
  monthly_overtime_warning?: number
  admin_id?: string
  current_password?: string
  new_password?: string
}

export async function PATCH(request: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as UpdateBody
    const admin = supabaseAdmin()

    // 管理者パスワード変更
    if (body.new_password) {
      if (!body.current_password) {
        return NextResponse.json({ error: '現在のパスワードを入力してください' }, { status: 400 })
      }
      if (body.new_password.length < 4) {
        return NextResponse.json({ error: '新しいパスワードは4文字以上で設定してください' }, { status: 400 })
      }
      if (body.new_password === body.current_password) {
        return NextResponse.json({ error: '現在のパスワードと異なるものを設定してください' }, { status: 400 })
      }
      const { data: settings } = await admin
        .from('settings').select('admin_password_hash').eq('id', 1).single()
      if (!settings) {
        return NextResponse.json({ error: 'システム設定が取得できません' }, { status: 500 })
      }
      const isValid = await bcrypt.compare(body.current_password, settings.admin_password_hash)
      if (!isValid) {
        return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 401 })
      }
      const newHash = await bcrypt.hash(body.new_password, 10)
      const { error } = await admin
        .from('settings')
        .update({
          admin_password_hash: newHash,
          admin_password_changed_at: new Date().toISOString(),
        })
        .eq('id', 1)
      if (error) {
        return NextResponse.json({ error: 'パスワード更新失敗: ' + error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    // 通常設定の更新
    const updates: Record<string, unknown> = {}
    if (body.company_name !== undefined) updates.company_name = body.company_name
    if (body.standard_work_hours !== undefined) updates.standard_work_hours = body.standard_work_hours
    if (body.standard_work_days !== undefined) updates.standard_work_days = body.standard_work_days
    if (body.work_start_time !== undefined) updates.work_start_time = body.work_start_time
    if (body.work_end_time !== undefined) updates.work_end_time = body.work_end_time
    if (body.monthly_overtime_limit !== undefined) updates.monthly_overtime_limit = body.monthly_overtime_limit
    if (body.yearly_overtime_limit !== undefined) updates.yearly_overtime_limit = body.yearly_overtime_limit
    if (body.monthly_overtime_warning !== undefined) updates.monthly_overtime_warning = body.monthly_overtime_warning
    if (body.admin_id !== undefined) updates.admin_id = body.admin_id

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
    }
    const { error } = await admin.from('settings').update(updates).eq('id', 1)
    if (error) {
      return NextResponse.json({ error: '更新失敗: ' + error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
