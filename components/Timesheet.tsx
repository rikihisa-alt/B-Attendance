// 印刷用の出勤簿。画面では非表示 (.print-only) で、@media print の時だけ可視。
// 一般的な日本企業の出勤簿に含まれる項目:
//   - 会社名 / 対象期間 / 印刷日
//   - 従業員氏名・社員ID・所属・役職
//   - 日次: 日付 / 曜 / 始業 / 終業 / 休憩 / 実労働 / 残業 / 備考
//   - 月次合計: 出勤日数 / 総実労働 / 総残業 / 総休憩
//   - 確認欄: 本人 / 上長 / 管理者

import { calcDay } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes, dowJa } from '@/lib/format'
import type { Employee, Attendance, AttendanceEvent, Settings } from '@/types/db'

interface TimesheetProps {
  employee: Pick<Employee, 'id' | 'name' | 'kana' | 'dept' | 'position'> | null
  monthStr: string                  // "YYYY-MM"
  records: Record<string, Attendance>  // date -> attendance
  settings: Settings | null
  showAdminNote?: boolean            // admin印刷では管理者メモ列も含める
}

function getMonthDays(monthStr: string): Date[] {
  const [y, m] = monthStr.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return Array.from({ length: last }, (_, i) => new Date(y, m - 1, i + 1))
}

function fmtDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function Timesheet({
  employee,
  monthStr,
  records,
  settings,
  showAdminNote = false,
}: TimesheetProps) {
  const days = getMonthDays(monthStr)
  const [y, m] = monthStr.split('-').map(Number)
  const standardMin = (settings?.standard_work_hours ?? 8) * 60

  // 月次集計
  let workDays = 0
  let totalWorked = 0
  let totalOvertime = 0
  let totalBreak = 0

  const dayRows = days.map(d => {
    const dKey = fmtDateKey(d)
    const rec = records[dKey]
    const calc = rec ? calcDay(rec.events as AttendanceEvent[]) : null
    const dow = d.getDay()
    const isWeekend = dow === 0 || dow === 6

    const worked = calc?.totalWorked || 0
    const overtime = worked > standardMin ? worked - standardMin : 0
    if (worked > 0) {
      workDays++
      totalWorked += worked
      totalOvertime += overtime
      totalBreak += calc?.totalBreak || 0
    }

    return {
      d, dKey, dow, isWeekend, calc, rec, worked, overtime,
    }
  })

  return (
    <div className="print-only timesheet">
      {/* 上部: タイトル + 押印欄を横並び */}
      <div className="timesheet-topbar">
        <div className="timesheet-header">
          <div className="timesheet-company">{settings?.company_name || '株式会社'}</div>
          <h1 className="timesheet-title">出 勤 簿</h1>
          <div className="timesheet-period">{y}年 {m}月分</div>
        </div>
        <table className="timesheet-seals">
          <thead>
            <tr>
              <th>本人</th>
              <th>所属長</th>
              <th>管理者</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="seal-box"></td>
              <td className="seal-box"></td>
              <td className="seal-box"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 従業員情報 + 月次集計を1テーブルに統合（横並び） */}
      <table className="timesheet-meta">
        <tbody>
          <tr>
            <th>社員ID</th>
            <td className="cell-mono">{employee?.id || '-'}</td>
            <th>氏名</th>
            <td className="timesheet-name">
              {employee?.name || '-'}
              {employee?.kana && <span className="timesheet-kana"> ({employee.kana})</span>}
            </td>
            <th>所属</th>
            <td>{employee?.dept || '-'}</td>
            <th>役職</th>
            <td>{employee?.position || '-'}</td>
          </tr>
          <tr>
            <th>出勤日数</th>
            <td className="cell-mono">{workDays} 日</td>
            <th>総実労働</th>
            <td className="cell-mono">{formatMinutes(totalWorked)}</td>
            <th>総残業</th>
            <td className="cell-mono">{formatMinutes(totalOvertime)}</td>
            <th>総休憩</th>
            <td className="cell-mono">{totalBreak} 分</td>
          </tr>
        </tbody>
      </table>

      {/* 日次明細 */}
      <table className="timesheet-days">
        <thead>
          <tr>
            <th className="col-date">日付</th>
            <th className="col-dow">曜</th>
            <th className="col-time">始業</th>
            <th className="col-time">終業</th>
            <th className="col-mins">休憩</th>
            <th className="col-mins">実労働</th>
            <th className="col-mins">残業</th>
            <th className="col-note">備考</th>
          </tr>
        </thead>
        <tbody>
          {dayRows.map(({ d, dKey, dow, isWeekend, calc, rec, worked, overtime }) => {
            const note = [
              rec?.note,
              showAdminNote ? rec?.admin_note : null,
            ].filter(Boolean).join(' / ')
            return (
              <tr key={dKey} className={isWeekend ? 'is-weekend' : ''}>
                <td className="col-date cell-mono">{d.getMonth() + 1}/{d.getDate()}</td>
                <td className={`col-dow ${dow === 0 ? 'is-sun' : ''} ${dow === 6 ? 'is-sat' : ''}`}>
                  {dowJa(d)}
                </td>
                <td className="col-time cell-mono">
                  {calc?.firstIn ? fmtTimeShort(calc.firstIn) : ''}
                </td>
                <td className="col-time cell-mono">
                  {calc?.lastOut ? fmtTimeShort(calc.lastOut) : ''}
                </td>
                <td className="col-mins cell-mono">
                  {calc && calc.totalBreak > 0 ? `${calc.totalBreak}分` : ''}
                </td>
                <td className="col-mins cell-mono">
                  {worked > 0 ? formatMinutes(worked) : ''}
                </td>
                <td className="col-mins cell-mono">
                  {overtime > 0 ? formatMinutes(overtime) : ''}
                </td>
                <td className="col-note">{note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

    </div>
  )
}
