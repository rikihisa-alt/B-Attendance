import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAdminSession } from '@/lib/auth'

export const runtime = 'nodejs'

interface SelectBody {
  table: string
  columns?: string
  filters?: Record<string, string | number | boolean | null>
  in_filters?: Record<string, (string | number)[]>
  gte?: { column: string; value: string | number }
  lte?: { column: string; value: string | number }
  order?: { column: string; ascending?: boolean }
  limit?: number
  single?: boolean
  count_only?: boolean
}

const ALLOWED_TABLES = new Set([
  'employees',
  'attendance',
  'correction_requests',
  'leave_requests',
  'settings',
  'audit_log',
  'v_paid_leave_summary',
])

export async function POST(request: Request) {
  if (!(await verifyAdminSession())) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  try {
    const body = (await request.json()) as SelectBody
    if (!body.table || !ALLOWED_TABLES.has(body.table)) {
      return NextResponse.json({ error: 'テーブル名が不正です' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    let query = body.count_only
      ? admin.from(body.table).select(body.columns || '*', { count: 'exact', head: true })
      : admin.from(body.table).select(body.columns || '*')

    for (const [k, v] of Object.entries(body.filters || {})) {
      if (v === null) query = query.is(k, null)
      else if (v !== undefined) query = query.eq(k, v as string | number | boolean)
    }
    for (const [k, v] of Object.entries(body.in_filters || {})) {
      if (Array.isArray(v) && v.length > 0) query = query.in(k, v)
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
    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, count })
  } catch (e) {
    return NextResponse.json({ error: '処理エラー: ' + String(e) }, { status: 500 })
  }
}
