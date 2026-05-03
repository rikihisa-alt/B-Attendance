import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyUserSession } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET() {
  const empId = await verifyUserSession()
  if (!empId) {
    return NextResponse.json({ session: null })
  }
  const { data: emp } = await supabaseAdmin()
    .from('employees')
    .select('id, name, first_login, status')
    .eq('id', empId)
    .maybeSingle()
  if (!emp || emp.status !== 'active') {
    return NextResponse.json({ session: null })
  }
  return NextResponse.json({
    session: { empId: emp.id, name: emp.name, first_login: emp.first_login, role: 'user' },
  })
}
