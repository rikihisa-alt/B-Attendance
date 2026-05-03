import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface SelectBody {
  table: string
  columns?: string
  // emp_id 以外のフィルタ
  filters?: Record<string, string | number | boolean | null>
  gte?: { column: string; value: string | number }
  lte?: { column: string; value: string | number }
  order?: { column: string; ascending?: boolean }
  limit?: number
  single?: boolean
}

// 自分の行だけが見えるテーブル
const EMP_SCOPED = new Set(['attendance', 'leave_requests', 'correction_requests'])
// employees は自分の行のみ id=session.empId で参照可
// settings は全社共通の設定なのでフィルタ無しで読み取り可
const ALLOWED_TABLES = new Set(['attendance', 'leave_requests', 'correction_requests', 'employees', 'settings'])

export async function POST(request: Request) {
  const empId = await verifyUserSession()
  if (!empId) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as SelectBody
    if (!body.table || !ALLOWED_TABLES.has(body.table)) {
      return NextResponse.json({ error: 'テーブル名が不正です' }, { status: 400 })
    }
    const admin = supabaseAdmin()
    let query = admin.from(body.table).select(body.columns || '*')

    if (body.table === 'employees') {
      query = query.eq('id', empId)
    } else if (EMP_SCOPED.has(body.table)) {
      query = query.eq('emp_id', empId)
    }

    for (const [k, v] of Object.entries(body.filters || {})) {
      if (v === null) query = query.is(k, null)
      else if (v !== undefined) query = query.eq(k, v as string | number | boolean)
    }
    if (body.gte) query = query.gte(body.gte.column, body.gte.value)
    if (body.lte) query = query.lte(body.lte.column, body.lte.value)
    if (body.order) query = query.order(body.order.column, { ascending: body.order.ascending !== false })
    if (body.limit) query = query.limit(body.limit)

    if (body.single) {
      const { data, error } = await query.maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data })
    }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
