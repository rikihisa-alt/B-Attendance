'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminSelect } from '@/lib/api'
import { calcDay, sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes, dowJa } from '@/lib/format'
import { useCachedState } from '@/lib/cache'
import type { Employee, Attendance, AttendanceEvent, Settings } from '@/types/db'

const CK = 'admin-reports:'

type ReportKind = 'summary' | 'events' | 'overtime'

function thisMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions(): { value: string; label: string }[] {
  const today = new Date()
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ value: v, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
  }
  return opts
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row =>
    row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AdminReportsPage() {
  const [employees, setEmployees] = useCachedState<Employee[]>(CK + 'employees', [])
  const [settings, setSettings] = useCachedState<Settings | null>(CK + 'settings', null)
  const [monthStr, setMonthStr] = useState(thisMonth)
  const [empFilter, setEmpFilter] = useState('all')
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    const [empRes, sRes] = await Promise.all([
      adminSelect<Employee[]>({ table: 'employees', order: { column: 'id' } }),
      adminSelect<Settings>({ table: 'settings', filters: { id: 1 }, single: true }),
    ])
    setEmployees(empRes.data || [])
    setSettings(sRes.data)
  }, [setEmployees, setSettings])

  useEffect(() => { load() }, [load])

  const fetchMonthRecords = async (empIds: string[]): Promise<Record<string, Attendance[]>> => {
    const [y, m] = monthStr.split('-').map(Number)
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const result: Record<string, Attendance[]> = {}
    for (const id of empIds) result[id] = []
    if (empIds.length === 0) return result

    const { data } = await adminSelect<Attendance[]>({
      table: 'attendance',
      in_filters: { emp_id: empIds },
      gte: { column: 'date', value: startDate },
      lte: { column: 'date', value: endDate },
      order: { column: 'date' },
    })
    ;(data || []).forEach(rec => {
      if (!result[rec.emp_id]) result[rec.emp_id] = []
      result[rec.emp_id].push(rec)
    })
    return result
  }

  const exportCsv = async (kind: ReportKind) => {
    setGenerating(true)
    try {
      const targets = empFilter === 'all' ? employees : employees.filter(e => e.id === empFilter)
      const records = await fetchMonthRecords(targets.map(e => e.id))

      if (kind === 'summary') {
        const rows: (string | number)[][] = [
          ['社員ID', '氏名', '日付', '曜日', '初回出勤', '最終退勤', '休憩(分)', '実働(分)', '実働(時:分)'],
        ]
        for (const emp of targets) {
          for (const r of records[emp.id] || []) {
            const calc = calcDay(r.events as AttendanceEvent[])
            rows.push([
              emp.id, emp.name, r.date, dowJa(new Date(r.date + 'T00:00:00+09:00')),
              calc.firstIn ? fmtTimeShort(calc.firstIn) : '',
              calc.lastOut ? fmtTimeShort(calc.lastOut) : '',
              calc.totalBreak, calc.totalWorked, formatMinutes(calc.totalWorked),
            ])
          }
        }
        downloadCsv(`summary_${monthStr}.csv`, rows)
      } else if (kind === 'events') {
        const rows: (string | number)[][] = [
          ['社員ID', '氏名', '日付', '時刻', '種別', 'ソース', 'メモ', '取消'],
        ]
        for (const emp of targets) {
          for (const r of records[emp.id] || []) {
            for (const ev of sortedEvents(r.events as AttendanceEvent[])) {
              rows.push([
                emp.id, emp.name, r.date,
                new Date(ev.time).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }),
                ev.type, ev.source || '', ev.note || '', ev.cancelled ? 'YES' : '',
              ])
            }
          }
        }
        downloadCsv(`events_${monthStr}.csv`, rows)
      } else if (kind === 'overtime') {
        const standardMin = (settings?.standard_work_hours || 8) * 60
        const monthLimit = settings?.monthly_overtime_limit || 45
        const rows: (string | number)[][] = [
          ['社員ID', '氏名', '所属', '対象月', '出勤日数', '実働(分)', '実働(時:分)', '残業(時間)', '上限(時間)', '消化率(%)', '判定'],
        ]
        for (const emp of targets) {
          let totalWorked = 0, overtime = 0, workDays = 0
          for (const r of records[emp.id] || []) {
            const calc = calcDay(r.events as AttendanceEvent[])
            if (calc.totalWorked > 0) {
              workDays++
              totalWorked += calc.totalWorked
              if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
            }
          }
          const otHours = overtime / 60
          const ratio = (otHours / monthLimit) * 100
          const judge = otHours >= monthLimit ? '上限超過' : (otHours >= (settings?.monthly_overtime_warning || 36) ? '警告' : '余裕')
          rows.push([
            emp.id, emp.name, emp.dept || '', monthStr,
            workDays, totalWorked, formatMinutes(totalWorked),
            otHours.toFixed(1), monthLimit, ratio.toFixed(0), judge,
          ])
        }
        downloadCsv(`overtime_${monthStr}.csv`, rows)
      }
      showToast('CSVを出力しました', 'success')
    } catch (e) {
      showToast('出力エラー: ' + String(e), 'error')
    }
    setGenerating(false)
  }

  const printReport = () => {
    showToast('印刷ダイアログを準備中...（PDFは別ウィンドウから印刷ダイアログ経由で保存してください）', 'info')
    window.print()
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">レポート出力</span>
          <span className="page-title-en">EXPORT</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">管理者</span>さん、お疲れ様です。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">月次レポート</span>
            <span className="card-title-en">MONTHLY REPORT</span>
          </div>
        </div>
        <div className="card-body">
          <div className="row" style={{ maxWidth: 480, marginBottom: 18 }}>
            <div className="field">
              <label>
                <span className="lbl-ja">対象月</span>
                <span className="lbl-en">MONTH</span>
              </label>
              <select value={monthStr} onChange={e => setMonthStr(e.target.value)}>
                {monthOptions().map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                <span className="lbl-ja">対象従業員</span>
                <span className="lbl-en">EMPLOYEE</span>
              </label>
              <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
                <option value="all">全従業員</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.id} / {e.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--text-soft)',
              marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
            }}>CSV形式 / CSV FORMAT</div>
            <div className="gap-8">
              <button className="btn btn-primary" onClick={() => exportCsv('summary')} disabled={generating}>
                <svg className="icon-svg-sm"><use href="#i-download" /></svg>
                サマリーCSV / Summary
              </button>
              <button className="btn btn-primary" onClick={() => exportCsv('events')} disabled={generating}>
                <svg className="icon-svg-sm"><use href="#i-download" /></svg>
                全打刻ログCSV / All Events
              </button>
              <button className="btn btn-primary" onClick={() => exportCsv('overtime')} disabled={generating}>
                <svg className="icon-svg-sm"><use href="#i-download" /></svg>
                残業集計CSV / Overtime
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--text-soft)',
              marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em',
            }}>PDF形式 / PDF FORMAT (印刷ダイアログ経由)</div>
            <div className="gap-8">
              <button className="btn btn-primary" onClick={printReport}>
                <svg className="icon-svg-sm"><use href="#i-download" /></svg>
                印刷ダイアログを開く
              </button>
            </div>
            <p style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              PDFは印刷ダイアログから「PDFに保存」を選択してください。本格的なPDFレイアウト（出勤簿、月次サマリー）は今後の実装になります。
            </p>
          </div>

          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            ・サマリーCSV: 1日1行（初回出勤、最終退勤、休憩合計、実働合計）<br />
            ・全打刻ログCSV: 全イベントを時系列で出力（給与計算詳細用）<br />
            ・残業集計CSV: 36協定チェック用、月別残業時間一覧<br />
            ・出勤簿PDF: 労基法対応の客観的記録（5年間保存義務）
          </p>
        </div>
      </div>

      {toast && (
        <div className={`toast show ${toast.type}`}>
          <span className="toast-msg">{toast.msg}</span>
        </div>
      )}
    </section>
  )
}
