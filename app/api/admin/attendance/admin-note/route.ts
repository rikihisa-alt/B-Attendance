import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface PostBody {
  emp_id: string
  date: string
  admin_note: string
}

export async function POST(request: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as PostBody
    if (!body.emp_id || !body.date) {
      return NextResponse.json({ error: 'emp_id と date は必須です' }, { status: 400 })
    }
    const admin = supabaseAdmin()
    const updates = {
      admin_note: body.admin_note,
      admin_note_updated_at: new Date().toISOString(),
      admin_note_by: 'admin',
    }
    const { data: existing } = await admin
      .from('attendance').select('id')
      .eq('emp_id', body.emp_id).eq('date', body.date).maybeSingle()
    if (existing) {
      const { error } = await admin.from('attendance').update(updates)
        .eq('emp_id', body.emp_id).eq('date', body.date)
      if (error) {
        return NextResponse.json({ error: '更新失敗: ' + error.message }, { status: 500 })
      }
    } else {
      const { error } = await admin.from('attendance').insert({
        emp_id: body.emp_id,
        date: body.date,
        events: [],
        note: '',
        ...updates,
      })
      if (error) {
        return NextResponse.json({ error: '挿入失敗: ' + error.message }, { status: 500 })
      }
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
