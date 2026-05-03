// Supabase テーブル型定義（supabase_schema.sql ベースの手動定義）
// npx supabase gen types typescript で上書き可

export interface Settings {
  id: number
  company_name: string
  standard_work_hours: number
  standard_work_days: number
  work_start_time: string
  work_end_time: string
  monthly_overtime_limit: number
  yearly_overtime_limit: number
  monthly_overtime_warning: number
  admin_id: string
  admin_password_hash: string
  admin_password_changed_at: string | null
  created_at: string
  updated_at: string
}

export interface Employee {
  id: string
  auth_user_id: string | null
  name: string
  kana: string | null
  birthday: string | null
  dept: string | null
  position: string | null
  status: 'active' | 'inactive'
  first_login: boolean
  pw_changed_at: string | null
  pw_reset_at: string | null
  password_hash: string | null
  created_at: string
  updated_at: string
}

export type AttendanceEventType = 'in' | 'out' | 'break_start' | 'break_end'
export type AttendanceEventSource = 'clock' | 'manual' | 'request' | 'admin-edit' | 'approved'

export interface AttendanceEvent {
  type: AttendanceEventType
  time: string
  source: AttendanceEventSource
  cancelled?: boolean
  cancelledAt?: string
  note?: string
}

export interface Attendance {
  id: string
  emp_id: string
  date: string
  events: AttendanceEvent[]
  note: string
  admin_note: string | null
  admin_note_updated_at: string | null
  admin_note_by: string | null
  modified_by: string | null
  modified_at: string | null
  created_at: string
  updated_at: string
}

export type CorrectionRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface CorrectionRequest {
  id: string
  emp_id: string
  emp_name: string
  date: string
  requested_events: AttendanceEvent[]
  reason: string
  status: CorrectionRequestStatus
  submitted_at: string
  reviewed_at: string | null
  reviewed_by: string | null
  withdrawn_at: string | null
  reject_reason: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  actor_type: 'admin' | 'user' | 'system'
  actor_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  before_data: unknown
  after_data: unknown
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

