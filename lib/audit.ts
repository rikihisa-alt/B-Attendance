// 監査ログ (audit_log) への書き込みヘルパ。
// すべての認証/打刻/申請/承認/設定変更で呼び出して、後から /admin/audit で
// タイムライン表示できるようにする。
// 失敗してもメインの処理を止めない (try/catch で握りつぶす)。

import { supabaseAdmin } from '@/lib/supabase/admin'

export type ActorType = 'admin' | 'user' | 'system'

export type AuditAction =
  // 認証
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'change_password'
  | 'reset_password'
  // 打刻
  | 'clock_in' | 'clock_out' | 'break_start' | 'break_end'
  | 'clock_cancel'
  // 勤怠 (管理者編集)
  | 'attendance_edit'
  | 'admin_note_update'
  // 修正申請
  | 'submit_correction'
  | 'withdraw_correction'
  | 'approve_correction'
  | 'reject_correction'
  // 従業員管理
  | 'employee_create'
  | 'employee_update'
  | 'employee_inactivate'
  | 'employee_id_change'
  // 設定
  | 'settings_update'
  | 'change_admin_password'

export interface AuditEntry {
  actorType: ActorType
  actorId?: string | null
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeData?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  afterData?: any
  request?: Request
}

function extractMeta(req?: Request): { ip: string | null; ua: string | null } {
  if (!req) return { ip: null, ua: null }
  const headers = req.headers
  // Vercel/Cloudflare 共通: x-forwarded-for に複数IPの場合は先頭を採用
  const xff = headers.get('x-forwarded-for')
  const ip = xff ? xff.split(',')[0].trim() : (headers.get('x-real-ip') || null)
  const ua = headers.get('user-agent') || null
  return { ip, ua }
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { ip, ua } = extractMeta(entry.request)
    await supabaseAdmin().from('audit_log').insert({
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      before_data: entry.beforeData ?? null,
      after_data: entry.afterData ?? null,
      ip_address: ip,
      user_agent: ua,
    })
  } catch (e) {
    // 監査ログの失敗は本処理に影響させない
    console.warn('audit_log insert failed:', e)
  }
}
