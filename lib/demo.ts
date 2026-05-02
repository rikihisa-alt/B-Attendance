// DEMO_MODE: Supabase なしでアプリ全機能をテストするためのインメモリDB
// 有効化条件:
//   1. 明示: NEXT_PUBLIC_DEMO_MODE=true
//   2. 自動: NEXT_PUBLIC_SUPABASE_URL が未設定（Supabase 立ち上げ前のフォールバック）
// 本番運用時は NEXT_PUBLIC_SUPABASE_URL を設定すれば自動でデモモードが切れる。

import type {
  Employee, Attendance,
  CorrectionRequest, LeaveRequest, Settings,
} from '@/types/db'

export const IS_DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

// 従業員はゼロから始める（管理者画面で追加していく想定）
const DEMO_EMPLOYEES: Employee[] = []

const DEMO_SETTINGS: Settings = {
  id: 1, company_name: '株式会社Backlly',
  standard_work_hours: 8, standard_work_days: 20,
  work_start_time: '09:00', work_end_time: '18:00',
  monthly_overtime_limit: 45, yearly_overtime_limit: 360, monthly_overtime_warning: 36,
  admin_id: 'admin',
  admin_password_hash: '$2a$10$dummyhashnotreal', // demoではplain比較
  admin_password_changed_at: null,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
}

// 勤怠もゼロから（従業員ゼロなので関連データも空）
function generateDemoAttendance(): Attendance[] {
  return []
}

// インメモリDB
export interface DemoDB {
  employees: Employee[]
  attendance: Attendance[]
  correction_requests: CorrectionRequest[]
  leave_requests: LeaveRequest[]
  settings: Settings
  // セッション
  session: { type: 'user' | 'admin'; empId?: string; name: string } | null
}

let _db: DemoDB | null = null

export function getDemoDB(): DemoDB {
  if (!_db) {
    _db = {
      employees: [...DEMO_EMPLOYEES],
      attendance: generateDemoAttendance(),
      correction_requests: [],
      leave_requests: [],
      settings: { ...DEMO_SETTINGS },
      session: null,
    }
  }
  return _db
}

export function resetDemoDB(): void {
  _db = null
}

// 従業員パスワードは管理者が登録した時に追加していく
export const DEMO_PASSWORDS: Record<string, string> = {}

export const DEMO_ADMIN_PASSWORD = 'admin'
