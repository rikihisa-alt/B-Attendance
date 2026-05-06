import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clearAdminSession, clearUserSession, verifyAdminSession, verifyUserSession } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    // クリア前にどちらのセッションが立っていたかを判定して監査ログに残す
    const wasAdmin = await verifyAdminSession()
    const userEmpId = await verifyUserSession()

    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // Supabase 側は失敗しても無視
    }

    await clearAdminSession()
    await clearUserSession()

    if (wasAdmin) {
      await logAudit({ actorType: 'admin', actorId: 'admin', action: 'logout', request })
    }
    if (userEmpId) {
      await logAudit({ actorType: 'user', actorId: userEmpId, action: 'logout', request })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'ログアウトに失敗しました' }, { status: 500 })
  }
}
