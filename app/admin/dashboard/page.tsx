'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { adminSelect } from '@/lib/api'
import { calcDay } from '@/lib/attendance'
import { dowJa, fmtTimeShort } from '@/lib/format'
import { useCachedState, hasCached } from '@/lib/cache'
import type { Employee, Attendance, AttendanceEvent, Settings } from '@/types/db'

const CK = 'admin-dashboard:'

type Severity = 'danger' | 'warning' | 'info'

interface Alert {
  severity: Severity
  iconId: string
  title: string
  desc: string
  actionLabel: string
  actionHref: string
}

const SEV_ORDER: Record<Severity, number> = { danger: 0, warning: 1, info: 2 }
const SEV_BADGE: Record<Severity, string> = {
  danger: 'badge-danger', warning: 'badge-warning', info: 'badge-info',
}
const SEV_LABEL: Record<Severity, string> = { danger: '緊急', warning: '注意', info: '情報' }
const SEV_BG: Record<Severity, string> = {
  danger: 'var(--red-bg)', warning: 'var(--yellow-bg)', info: 'var(--bg-soft)',
}
const SEV_BORDER: Record<Severity, string> = {
  danger: 'var(--red)', warning: 'var(--yellow)', info: 'var(--text-faint)',
}

function todayIso(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

function monthIso(d: Date): string {
  const ym = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 7)
  return ym
}

interface TodayRow {
  emp: Employee
  rec: Attendance | null
}

export default function AdminDashboardPage() {
  const [employees, setEmployees] = useCachedState<Employee[]>(CK + 'employees', [])
  const [todayRows, setTodayRows] = useCachedState<TodayRow[]>(CK + 'todayRows', [])
  const [pendingCount, setPendingCount] = useCachedState<number>(CK + 'pendingCount', 0)
  const [alerts, setAlerts] = useCachedState<Alert[]>(CK + 'alerts', [])
  const [settings, setSettings] = useCachedState<Settings | null>(CK + 'settings', null)
  const [loading, setLoading] = useState<boolean>(() => !hasCached(CK + 'employees'))

  const load = useCallback(async () => {
    if (!hasCached(CK + 'employees')) setLoading(true)

    // 並列で集約クエリを発行: 従業員一覧 / 設定 / 承認待ちカウント / 直近7日の全勤怠
    const today = todayIso()
    const since = new Date()
    since.setDate(since.getDate() - 7)
    const sinceIso = since.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })

    const month = monthIso(new Date())
    const [y, m] = month.split('-').map(Number)
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // 過去7日と当月どっちもカバーする日付範囲（広い方）
    const wideStart = sinceIso < monthStart ? sinceIso : monthStart
    const wideEnd = today > monthEnd ? today : monthEnd

    const [empRes, sRes, ccRes] = await Promise.all([
      adminSelect<Employee[]>({ table: 'employees', filters: { status: 'active' } }),
      adminSelect<Settings>({ table: 'settings', filters: { id: 1 }, single: true }),
      adminSelect({ table: 'correction_requests', filters: { status: 'pending' }, count_only: true }),
    ])
    const emps: Employee[] = empRes.data || []
    const stngs: Settings | null = sRes.data
    const pendingC = ccRes.count || 0

    const active = emps.filter(e => e.status === 'active')
    const empIds = active.map(e => e.id)
    let allRecords: Attendance[] = []
    if (empIds.length > 0) {
      const { data: recs } = await adminSelect<Attendance[]>({
        table: 'attendance',
        in_filters: { emp_id: empIds },
        gte: { column: 'date', value: wideStart },
        lte: { column: 'date', value: wideEnd },
      })
      allRecords = recs || []
    }
    setEmployees(active)
    setSettings(stngs)
    setPendingCount(pendingC)

    // emp_id ごとに record をインデックス
    const recByEmpDate = new Map<string, Attendance>()
    for (const r of allRecords) {
      recByEmpDate.set(`${r.emp_id}:${r.date}`, r)
    }
    const recsByEmp = new Map<string, Attendance[]>()
    for (const r of allRecords) {
      const list = recsByEmp.get(r.emp_id) || []
      list.push(r)
      recsByEmp.set(r.emp_id, list)
    }

    // 本日の勤務状況
    const rows: TodayRow[] = active.map(emp => ({
      emp,
      rec: recByEmpDate.get(`${emp.id}:${today}`) || null,
    }))
    setTodayRows(rows)

    // アラート生成
    const ats: Alert[] = []
    const monthLimit = stngs?.monthly_overtime_limit ?? 45
    const monthWarn = stngs?.monthly_overtime_warning ?? 36
    const standardMin = (stngs?.standard_work_hours ?? 8) * 60

    for (const emp of active) {
      const empRecs = recsByEmp.get(emp.id) || []

      // 1. 直近7日の未退勤打刻漏れ・休憩終了打刻漏れ
      for (const r of empRecs) {
        if (r.date === today) continue
        if (r.date < sinceIso) continue
        const calc = calcDay(r.events as AttendanceEvent[])
        if (calc.firstIn && !calc.lastOut && !calc.isOnBreak) {
          ats.push({
            severity: 'danger',
            iconId: 'i-warning',
            title: `${emp.name} (${emp.id}) - ${r.date} 未退勤の打刻漏れ`,
            desc: '出勤打刻はありますが退勤打刻がありません。修正申請または管理者編集が必要です。',
            actionLabel: '勤怠を確認',
            actionHref: `/admin/attendance?emp=${emp.id}`,
          })
        }
        if (calc.isOnBreak) {
          ats.push({
            severity: 'warning',
            iconId: 'i-warning',
            title: `${emp.name} (${emp.id}) - ${r.date} 休憩終了の打刻漏れ`,
            desc: '休憩開始のまま終了打刻がありません。実働時間が正しく計算されません。',
            actionLabel: '勤怠を確認',
            actionHref: `/admin/attendance?emp=${emp.id}`,
          })
        }
      }

      // 2. 初回ログイン未完了
      if (emp.first_login) {
        ats.push({
          severity: 'info',
          iconId: 'i-user',
          title: `${emp.name} (${emp.id}) - 初回ログイン未完了`,
          desc: '初期パスワードが変更されていません。本人にログインを促してください。',
          actionLabel: '従業員を編集',
          actionHref: `/admin/employees?id=${emp.id}`,
        })
      }

      // 3. 36協定上限超過 / 警告ライン超過（今月）
      let overtime = 0
      empRecs.forEach(r => {
        if (r.date < monthStart || r.date > monthEnd) return
        const calc = calcDay(r.events as AttendanceEvent[])
        if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
      })
      const otHours = overtime / 60
      if (otHours >= monthLimit) {
        ats.push({
          severity: 'danger',
          iconId: 'i-warning',
          title: `${emp.name} (${emp.id}) - 36協定 月上限超過`,
          desc: `今月の残業時間が ${otHours.toFixed(1)}h で月間上限 ${monthLimit}h を超えています。労基法違反のおそれ。`,
          actionLabel: '残業管理',
          actionHref: '/admin/overtime',
        })
      } else if (otHours >= monthWarn) {
        ats.push({
          severity: 'warning',
          iconId: 'i-warning',
          title: `${emp.name} (${emp.id}) - 残業時間が警告ライン超過`,
          desc: `今月の残業時間が ${otHours.toFixed(1)}h で警告ライン ${monthWarn}h を超えています。`,
          actionLabel: '残業管理',
          actionHref: '/admin/overtime',
        })
      }
    }

    ats.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    setAlerts(ats)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = new Date()
  const greetingMeta = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 (${dowJa(today)})`

  // 統計
  let working = 0, onBreak = 0
  todayRows.forEach(r => {
    if (!r.rec) return
    const calc = calcDay(r.rec.events as AttendanceEvent[])
    if (calc.isWorking) working++
    if (calc.isOnBreak) onBreak++
  })

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">ダッシュボード</span>
          <span className="page-title-en">DASHBOARD</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">管理者</span>さん、お疲れ様です。
          </div>
          <div className="greeting-meta">
            <span>{greetingMeta}</span>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card color-blue">
          <div className="stat-icon-box"><svg><use href="#i-users" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">登録従業員</span>
              <span className="stat-label-en">EMPLOYEES</span>
            </div>
            <div className="stat-value">{employees.length}</div>
          </div>
        </div>
        <div className="stat-card color-green">
          <div className="stat-icon-box"><svg><use href="#i-in" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">本日勤務中</span>
              <span className="stat-label-en">WORKING</span>
            </div>
            <div className="stat-value">{working}</div>
          </div>
        </div>
        <div className="stat-card color-yellow">
          <div className="stat-icon-box"><svg><use href="#i-break-start" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">休憩中</span>
              <span className="stat-label-en">ON BREAK</span>
            </div>
            <div className="stat-value">{onBreak}</div>
          </div>
        </div>
        <div className="stat-card color-orange">
          <div className="stat-icon-box"><svg><use href="#i-warning" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">承認待ち</span>
              <span className="stat-label-en">PENDING</span>
            </div>
            <div className="stat-value">{pendingCount}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">アラート ({alerts.length}件)</span>
            <span className="card-title-en">ALERTS / 要対応</span>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state">読み込み中...</div>
          ) : alerts.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              <svg className="icon-svg-lg empty-state-icon" style={{ color: 'var(--green)' }}>
                <use href="#i-check" />
              </svg>
              <div>現在、対応が必要なアラートはありません。</div>
            </div>
          ) : (
            alerts.map((a, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                  background: SEV_BG[a.severity], border: '1px solid var(--border)',
                  borderLeft: `4px solid ${SEV_BORDER[a.severity]}`, borderRadius: 6, marginBottom: 8,
                }}
              >
                <svg className="icon-svg" style={{ color: SEV_BORDER[a.severity], flexShrink: 0 }}>
                  <use href={`#${a.iconId}`} />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span className={`badge ${SEV_BADGE[a.severity]}`}>{SEV_LABEL[a.severity]}</span>
                    <b style={{ fontSize: 13 }}>{a.title}</b>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5 }}>{a.desc}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  <Link href={a.actionHref} className="btn btn-sm">{a.actionLabel}</Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">本日の勤務状況</span>
            <span className="card-title-en">STATUS TODAY</span>
          </div>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>社員ID / ID</th>
                  <th>氏名 / Name</th>
                  <th>所属 / Dept</th>
                  <th>初回出勤 / First In</th>
                  <th>最終退勤 / Last Out</th>
                  <th>打刻数 / Cnt</th>
                  <th>状態 / Status</th>
                </tr>
              </thead>
              <tbody>
                {todayRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">登録された従業員がありません</div>
                    </td>
                  </tr>
                ) : (
                  todayRows.map(({ emp, rec }) => {
                    const calc = rec ? calcDay(rec.events as AttendanceEvent[]) : null
                    let statusBadge: React.ReactNode = <span className="badge badge-info">未出勤</span>
                    if (calc?.isWorking) statusBadge = <span className="badge badge-success">勤務中</span>
                    else if (calc?.isOnBreak) statusBadge = <span className="badge badge-warning">休憩中</span>
                    else if (calc?.isAfterOut) statusBadge = <span className="badge badge-info">退勤済</span>
                    return (
                      <tr key={emp.id}>
                        <td className="cell-mono">{emp.id}</td>
                        <td>{emp.name}</td>
                        <td>{emp.dept || '-'}</td>
                        <td className="cell-mono">{calc?.firstIn ? fmtTimeShort(calc.firstIn) : '-'}</td>
                        <td className="cell-mono">{calc?.lastOut ? fmtTimeShort(calc.lastOut) : '-'}</td>
                        <td className="cell-mono">{calc?.eventCount || 0}</td>
                        <td>{statusBadge}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
