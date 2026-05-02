'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetEmployees, apiGetAttendance, apiGetSettings, adminSelect } from '@/lib/api'
import { calcDay } from '@/lib/attendance'
import { formatMinutes } from '@/lib/format'
import type { Employee, Attendance, AttendanceEvent, Settings } from '@/types/db'

interface Row {
  emp: Employee
  totalWorked: number
  overtime: number
  workDays: number
}

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

export default function AdminOvertimePage() {
  const [monthStr, setMonthStr] = useState(thisMonth)
  const [rows, setRows] = useState<Row[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const [y, m] = monthStr.split('-').map(Number)
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    let emps: Employee[] = []
    let s: Settings | null = null
    let allRecords: Attendance[] = []

    if (IS_DEMO) {
      const [empRes, sRes] = await Promise.all([apiGetEmployees(), apiGetSettings()])
      const [empJson, sData] = await Promise.all([empRes.json(), sRes.json()])
      emps = (empJson.data || []) as Employee[]
      s = sData.data as Settings | null

      // DEMO はカット日付指定で per-emp 並列で
      const recsPer = await Promise.all(
        emps.map(emp =>
          apiGetAttendance(emp.id, startDate, endDate)
            .then(r => r.json())
            .then(d => (d.data || []) as Attendance[])
        )
      )
      allRecords = recsPer.flat()
    } else {
      const [empRes, sRes] = await Promise.all([
        adminSelect<Employee[]>({
          table: 'employees', filters: { status: 'active' },
          order: { column: 'id' },
        }),
        adminSelect<Settings>({
          table: 'settings', filters: { id: 1 }, single: true,
        }),
      ])
      emps = empRes.data || []
      s = sRes.data

      const empIds = emps.map(e => e.id)
      if (empIds.length > 0) {
        const { data } = await adminSelect<Attendance[]>({
          table: 'attendance',
          in_filters: { emp_id: empIds },
          gte: { column: 'date', value: startDate },
          lte: { column: 'date', value: endDate },
        })
        allRecords = data || []
      }
    }
    setSettings(s)

    const standardMin = (s?.standard_work_hours || 8) * 60
    const recsByEmp = new Map<string, Attendance[]>()
    for (const r of allRecords) {
      const list = recsByEmp.get(r.emp_id) || []
      list.push(r)
      recsByEmp.set(r.emp_id, list)
    }

    const list: Row[] = emps.map(emp => {
      const recs = recsByEmp.get(emp.id) || []
      let totalWorked = 0, overtime = 0, workDays = 0
      recs.forEach(r => {
        const calc = calcDay(r.events as AttendanceEvent[])
        if (calc.totalWorked > 0) {
          workDays++
          totalWorked += calc.totalWorked
          if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
        }
      })
      return { emp, totalWorked, overtime, workDays }
    })
    setRows(list)
    setLoading(false)
  }, [monthStr])

  useEffect(() => { load() }, [load])

  const monthLimit = settings?.monthly_overtime_limit || 45
  const yearLimit = settings?.yearly_overtime_limit || 360
  const monthWarn = settings?.monthly_overtime_warning || 36
  const standardHours = settings?.standard_work_hours || 8
  const standardDays = settings?.standard_work_days || 20

  // 集計
  const totalOvertimeHours = rows.reduce((sum, r) => sum + r.overtime, 0) / 60
  const overLimitCount = rows.filter(r => r.overtime / 60 >= monthLimit).length
  const overWarnCount = rows.filter(r => r.overtime / 60 >= monthWarn).length

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">残業管理</span>
          <span className="page-title-en">OVERTIME (36 AGREEMENT)</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">管理者</span>さん、お疲れ様です。
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card color-blue">
          <div className="stat-icon-box"><svg><use href="#i-stopwatch" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">合計残業</span>
              <span className="stat-label-en">TOTAL OT</span>
            </div>
            <div className="stat-value">{totalOvertimeHours.toFixed(1)}<span className="stat-unit">h</span></div>
          </div>
        </div>
        <div className="stat-card color-yellow">
          <div className="stat-icon-box"><svg><use href="#i-warning" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">警告ライン超過</span>
              <span className="stat-label-en">WARN</span>
            </div>
            <div className="stat-value">{overWarnCount}<span className="stat-unit">名</span></div>
          </div>
        </div>
        <div className="stat-card color-red">
          <div className="stat-icon-box"><svg><use href="#i-warning" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">月上限超過</span>
              <span className="stat-label-en">OVER LIMIT</span>
            </div>
            <div className="stat-value">{overLimitCount}<span className="stat-unit">名</span></div>
          </div>
        </div>
        <div className="stat-card color-green">
          <div className="stat-icon-box"><svg><use href="#i-users" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">対象人数</span>
              <span className="stat-label-en">EMPLOYEES</span>
            </div>
            <div className="stat-value">{rows.length}<span className="stat-unit">名</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">月次残業時間一覧</span>
            <span className="card-title-en">MONTHLY OVERTIME / 36 AGREEMENT CHECK</span>
          </div>
          <select value={monthStr} onChange={e => setMonthStr(e.target.value)}>
            {monthOptions().map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
            36協定上限：月<b>{monthLimit}</b>時間 / 年<b>{yearLimit}</b>時間 ／ 警告ライン：<b>{monthWarn}</b>時間（80%）
          </p>
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : rows.length === 0 ? (
              <div className="empty-state">対象従業員がいません</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>社員ID</th>
                    <th>氏名</th>
                    <th>所属</th>
                    <th>当月実働</th>
                    <th>所定労働時間</th>
                    <th>残業時間</th>
                    <th>消化率</th>
                    <th>状態</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const otHours = r.overtime / 60
                    const ratio = otHours / monthLimit
                    let statusBadge: React.ReactNode = <span className="badge badge-success">余裕</span>
                    if (otHours >= monthLimit) statusBadge = <span className="badge badge-danger">月上限超過</span>
                    else if (otHours >= monthWarn) statusBadge = <span className="badge badge-warning">警告ライン超過</span>
                    const standardWorked = (standardHours * standardDays) // 月所定労働
                    return (
                      <tr key={r.emp.id}>
                        <td className="cell-mono">{r.emp.id}</td>
                        <td>{r.emp.name}</td>
                        <td>{r.emp.dept || '-'}</td>
                        <td className="cell-mono">{formatMinutes(r.totalWorked)}</td>
                        <td className="cell-mono">{standardWorked}h</td>
                        <td className="cell-mono">{otHours.toFixed(1)}h</td>
                        <td className="cell-mono">{(ratio * 100).toFixed(0)}%</td>
                        <td>{statusBadge}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
