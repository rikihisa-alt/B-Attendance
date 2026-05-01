// DEMO_MODE: Supabase なしでアプリ全機能をテストするためのインメモリDB
// 有効化条件:
//   1. 明示: NEXT_PUBLIC_DEMO_MODE=true
//   2. 自動: NEXT_PUBLIC_SUPABASE_URL が未設定（Supabase 立ち上げ前のフォールバック）
// 本番運用時は NEXT_PUBLIC_SUPABASE_URL を設定すれば自動でデモモードが切れる。

import type {
  Employee, Attendance, AttendanceEvent,
  CorrectionRequest, LeaveRequest, Settings,
} from '@/types/db'

export const IS_DEMO =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL

// ダミー従業員
const DEMO_EMPLOYEES: Employee[] = [
  {
    id: 'EMP001', auth_user_id: 'demo-001', name: '山田太郎', kana: 'やまだ たろう',
    birthday: '1990-04-15', dept: '開発部', position: '主任',
    status: 'active', paid_leave_total: 15, paid_leave_used: 3,
    first_login: false, pw_changed_at: '2026-01-10T10:00:00Z', pw_reset_at: null,
    created_at: '2025-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'EMP002', auth_user_id: 'demo-002', name: '佐藤花子', kana: 'さとう はなこ',
    birthday: '1995-08-22', dept: '営業部', position: null,
    status: 'active', paid_leave_total: 10, paid_leave_used: 1,
    first_login: true, pw_changed_at: null, pw_reset_at: null,
    created_at: '2025-06-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'EMP003', auth_user_id: 'demo-003', name: '鈴木一郎', kana: 'すずき いちろう',
    birthday: '1988-12-01', dept: '総務部', position: '課長',
    status: 'active', paid_leave_total: 20, paid_leave_used: 5,
    first_login: false, pw_changed_at: '2026-02-15T10:00:00Z', pw_reset_at: null,
    created_at: '2024-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
  },
]

const DEMO_SETTINGS: Settings = {
  id: 1, company_name: '株式会社Backlly',
  standard_work_hours: 8, standard_work_days: 20,
  work_start_time: '09:00', work_end_time: '18:00',
  monthly_overtime_limit: 45, yearly_overtime_limit: 360, monthly_overtime_warning: 36,
  admin_password_hash: '$2a$10$dummyhashnotreal', // demoではplain比較
  admin_password_changed_at: null,
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
}

// 過去数日分のダミー勤怠データを生成
function generateDemoAttendance(): Attendance[] {
  const records: Attendance[] = []
  const today = new Date()

  for (let dayOffset = -7; dayOffset <= 0; dayOffset++) {
    const d = new Date(today)
    d.setDate(d.getDate() + dayOffset)
    const dateStr = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    const dow = new Date(dateStr + 'T00:00:00+09:00').getDay()
    if (dow === 0 || dow === 6) continue // 土日スキップ

    // EMP001 のみ過去データ
    if (dayOffset < 0) {
      const inTime = new Date(`${dateStr}T09:0${Math.floor(Math.random() * 5)}:00+09:00`)
      const bsTime = new Date(`${dateStr}T12:00:00+09:00`)
      const beTime = new Date(`${dateStr}T13:00:00+09:00`)
      const outTime = new Date(`${dateStr}T18:${10 + Math.floor(Math.random() * 30)}:00+09:00`)

      records.push({
        id: `demo-att-emp001-${dateStr}`,
        emp_id: 'EMP001', date: dateStr,
        events: [
          { type: 'in', time: inTime.toISOString(), source: 'clock' },
          { type: 'break_start', time: bsTime.toISOString(), source: 'clock' },
          { type: 'break_end', time: beTime.toISOString(), source: 'clock' },
          { type: 'out', time: outTime.toISOString(), source: 'clock' },
        ],
        note: '', admin_note: null, admin_note_updated_at: null, admin_note_by: null,
        modified_by: null, modified_at: null,
        created_at: inTime.toISOString(), updated_at: outTime.toISOString(),
      })
    }
  }
  return records
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

// デモ用パスワード
export const DEMO_PASSWORDS: Record<string, string> = {
  EMP001: 'pass',
  EMP002: 'pass',
  EMP003: 'pass',
}

export const DEMO_ADMIN_PASSWORD = 'admin'
