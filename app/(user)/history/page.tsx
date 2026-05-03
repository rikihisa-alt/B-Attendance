'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { IS_DEMO, apiGetSession, apiGetAttendance } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { calcDay, sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes, dowJa } from '@/lib/format'
import { useCachedState, getCached, setCached } from '@/lib/cache'
import type { AttendanceEvent, Attendance, AttendanceEventType } from '@/types/db'

const CK = 'user-history:'

const TYPE_LABEL_JA: Record<AttendanceEventType, string> = {
  in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
}
const TYPE_BADGE: Record<AttendanceEventType, string> = {
  in: 'badge-orange',
  break_start: 'badge-warning',
  break_end: 'badge-teal',
  out: 'badge-success',
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthOptions(): { value: string; label: string }[] {
  const today = new Date()
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    opts.push({ value, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
  }
  return opts
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

export default function HistoryPage() {
  const router = useRouter()
  const [monthStr, setMonthStr] = useState(thisMonth)
  const [records, setRecords] = useState<Record<string, Attendance>>(
    () => getCached<Record<string, Attendance>>(`${CK}records:${thisMonth()}`) ?? {}
  )
  const [empId, setEmpId] = useCachedState<string>(CK + 'empId', '')
  const [userName, setUserName] = useCachedState<string>(CK + 'userName', '')
  const [loading, setLoading] = useState<boolean>(
    () => !getCached<Record<string, Attendance>>(`${CK}records:${thisMonth()}`)
  )
  const [detailDate, setDetailDate] = useState<string | null>(null)

  const fetchMonth = useCallback(async () => {
    const cacheKey = `${CK}records:${monthStr}`
    const cached = getCached<Record<string, Attendance>>(cacheKey)
    if (cached) {
      setRecords(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    let currentEmpId = ''
    let name = ''

    if (IS_DEMO) {
      const sessRes = await apiGetSession()
      const sessData = await sessRes.json()
      if (!sessData.session || sessData.session.type !== 'user') return
      currentEmpId = sessData.session.empId
      name = sessData.session.name || ''
    } else {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      currentEmpId = session.user.app_metadata?.emp_id
      const { data: emp } = await supabase
        .from('employees').select('name').eq('id', currentEmpId).single()
      name = emp?.name || ''
    }
    setEmpId(currentEmpId)
    setUserName(name)

    const [y, m] = monthStr.split('-').map(Number)
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    if (IS_DEMO) {
      const res = await apiGetAttendance(currentEmpId, startDate, endDate)
      const data = await res.json()
      const map: Record<string, Attendance> = {}
      data.data?.forEach((r: Attendance) => { map[r.date] = r })
      setRecords(map)
      setCached(cacheKey, map)
    } else {
      const supabase = createClient()
      const { data } = await supabase
        .from('attendance').select('*')
        .eq('emp_id', currentEmpId)
        .gte('date', startDate).lte('date', endDate)
        .order('date')
      const map: Record<string, Attendance> = {}
      data?.forEach(r => { map[r.date] = r as Attendance })
      setRecords(map)
      setCached(cacheKey, map)
    }
    setLoading(false)
  }, [monthStr, setEmpId, setUserName])

  useEffect(() => { fetchMonth() }, [fetchMonth])

  const days = useMemo(() => getMonthDays(monthStr), [monthStr])
  const monthOptions = useMemo(() => getMonthOptions(), [])

  // 月次集計
  let monthWorkDays = 0
  let monthTotalWorked = 0
  let monthTotalBreak = 0
  days.forEach(d => {
    const rec = records[fmtDateKey(d)]
    if (rec) {
      const calc = calcDay(rec.events as AttendanceEvent[])
      if (calc.firstIn) {
        monthWorkDays++
        monthTotalWorked += calc.totalWorked
        monthTotalBreak += calc.totalBreak
      }
    }
  })
  const avgWorked = monthWorkDays > 0 ? Math.round(monthTotalWorked / monthWorkDays) : 0

  const today = new Date()
  const todayKey = fmtDateKey(today)
  const detailRec = detailDate ? records[detailDate] : null
  const detailCalc = detailRec ? calcDay(detailRec.events as AttendanceEvent[]) : null
  const detailEvents = detailRec ? sortedEvents(detailRec.events as AttendanceEvent[]) : []

  const greetingDateLabel = (() => {
    const y = today.getFullYear(), m = today.getMonth() + 1, day = today.getDate()
    return `${y}年${m}月${day}日 (${dowJa(today)})`
  })()

  const handleOpenCorrection = (dateStr: string) => {
    router.push(`/requests?date=${dateStr}`)
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">勤怠履歴</span>
          <span className="page-title-en">ATTENDANCE HISTORY</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">{userName || '--'}</span>さん、お疲れ様です。
          </div>
          <div className="greeting-meta">
            <span>{greetingDateLabel}</span>
            <span className="greeting-meta-en"> / {empId || '--'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">月次サマリー</span>
            <span className="card-title-en">MONTHLY SUMMARY</span>
          </div>
          <select value={monthStr} onChange={e => setMonthStr(e.target.value)}>
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="card-body">
          <div className="stats-grid mb-12">
            <div className="stat-card color-blue">
              <div className="stat-icon-box"><svg><use href="#i-calendar" /></svg></div>
              <div className="stat-info">
                <div className="stat-label-block">
                  <span className="stat-label-ja">出勤日数</span>
                  <span className="stat-label-en">DAYS</span>
                </div>
                <div className="stat-value">{monthWorkDays}<span className="stat-unit">日</span></div>
              </div>
            </div>
            <div className="stat-card color-green">
              <div className="stat-icon-box"><svg><use href="#i-stopwatch" /></svg></div>
              <div className="stat-info">
                <div className="stat-label-block">
                  <span className="stat-label-ja">総実働</span>
                  <span className="stat-label-en">TOTAL</span>
                </div>
                <div className="stat-value">{formatMinutes(monthTotalWorked)}<span className="stat-unit">時間</span></div>
              </div>
            </div>
            <div className="stat-card color-yellow">
              <div className="stat-icon-box"><svg><use href="#i-break-start" /></svg></div>
              <div className="stat-info">
                <div className="stat-label-block">
                  <span className="stat-label-ja">総休憩</span>
                  <span className="stat-label-en">BREAK</span>
                </div>
                <div className="stat-value">{monthTotalBreak}<span className="stat-unit">分</span></div>
              </div>
            </div>
            <div className="stat-card color-orange">
              <div className="stat-icon-box"><svg><use href="#i-clock" /></svg></div>
              <div className="stat-info">
                <div className="stat-label-block">
                  <span className="stat-label-ja">平均実働</span>
                  <span className="stat-label-en">AVG</span>
                </div>
                <div className="stat-value">{formatMinutes(avgWorked)}<span className="stat-unit">時間</span></div>
              </div>
            </div>
          </div>

          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>日付 / Date</th>
                    <th>曜 / Day</th>
                    <th>出勤数 / Cnt</th>
                    <th>初回出勤 / First In</th>
                    <th>最終退勤 / Last Out</th>
                    <th>休憩 / Break</th>
                    <th>実働 / Worked</th>
                    <th>状態 / Status</th>
                    <th>操作 / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(d => {
                    const dKey = fmtDateKey(d)
                    const rec = records[dKey]
                    const calc = rec ? calcDay(rec.events as AttendanceEvent[]) : null
                    const dow = d.getDay()
                    const isFuture = d > today && dKey !== todayKey

                    let statusBadge: React.ReactNode = null
                    if (calc?.isWorking || calc?.isOnBreak) {
                      statusBadge = <span className="badge badge-warning">勤務中</span>
                    } else if (calc?.firstIn && calc.lastOut) {
                      statusBadge = <span className="badge badge-success">完了</span>
                    } else if (calc?.firstIn) {
                      statusBadge = <span className="badge badge-warning">未退勤</span>
                    } else if (!isFuture && dow !== 0 && dow !== 6) {
                      statusBadge = <span className="badge badge-info">記録なし</span>
                    }

                    let inBadge: React.ReactNode = <span className="text-muted">-</span>
                    if (calc?.inCount && calc.inCount > 1) {
                      inBadge = <span className="badge badge-purple">{calc.inCount}回</span>
                    } else if (calc?.inCount === 1) {
                      inBadge = <span className="badge badge-info">1回</span>
                    }

                    return (
                      <tr key={dKey}>
                        <td className="cell-mono">{dKey}</td>
                        <td>{dowJa(d)}</td>
                        <td>{inBadge}</td>
                        <td className="cell-mono">{calc?.firstIn ? fmtTimeShort(calc.firstIn) : '-'}</td>
                        <td className="cell-mono">{calc?.lastOut ? fmtTimeShort(calc.lastOut) : '-'}</td>
                        <td className="cell-mono">{calc && calc.totalBreak ? `${calc.totalBreak}分` : '-'}</td>
                        <td className="cell-mono">{calc && calc.totalWorked ? formatMinutes(calc.totalWorked) : '-'}</td>
                        <td>{statusBadge}</td>
                        <td>
                          <div className="action-buttons">
                            {calc && calc.eventCount > 0 && (
                              <button className="btn btn-sm" onClick={() => setDetailDate(dKey)}>詳細</button>
                            )}
                            <button className="btn btn-sm" onClick={() => handleOpenCorrection(dKey)}>修正申請</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {detailDate && (
        <div className="modal-overlay show" onClick={() => setDetailDate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">打刻詳細 / Detail</div>
              <button className="modal-close" onClick={() => setDetailDate(null)}>
                <svg className="icon-svg-sm"><use href="#i-x" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {detailDate} ({dowJa(new Date(detailDate + 'T00:00:00+09:00'))}) / {userName || empId}
                </div>
              </div>

              {detailCalc && detailCalc.sessions.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-soft)',
                    marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
                  }}>SESSIONS / 勤務セッション</div>
                  {detailCalc.sessions.map((s, idx) => (
                    <div key={idx} style={{
                      background: 'var(--green-bg)', border: '1px solid var(--green)',
                      borderLeft: '3px solid var(--green)', padding: '10px 14px',
                      marginBottom: 6, borderRadius: 6, fontSize: 13,
                    }}>
                      <b>セッション {idx + 1}</b>:{' '}
                      <span className="mono">
                        {s.in ? fmtTimeShort(s.in) : '--:--'} 〜 {s.out ? fmtTimeShort(s.out) : '勤務中'}
                      </span>
                      {' '}／ 休憩 {s.breakTotal}分 ／ 実働{' '}
                      <b style={{ color: 'var(--green)' }}>{formatMinutes(s.worked)}</b>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 8, padding: '10px 14px', background: 'var(--primary-bg)',
                    borderRadius: 6, fontSize: 13, border: '1px solid var(--border)',
                  }}>
                    <b>合計</b>: 出勤 {detailCalc.inCount}回 / 退勤 {detailCalc.outCount}回 / 休憩 {detailCalc.breakCount}回 / 実働{' '}
                    <b style={{ color: 'var(--primary)' }}>{formatMinutes(detailCalc.totalWorked)}</b>
                    {' '}/ 休憩合計 {detailCalc.totalBreak}分
                  </div>
                </div>
              )}

              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-soft)',
                marginBottom: 8, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em',
              }}>EVENT LOG / 打刻イベント</div>
              {detailEvents.length === 0 ? (
                <div className="text-muted text-center" style={{ padding: 24 }}>打刻記録なし</div>
              ) : (
                detailEvents.map((ev, i) => (
                  <div key={i} className="eventlog-row">
                    <span className="eventlog-time">{fmtTimeShort(ev.time)}</span>
                    <span><span className={`badge ${TYPE_BADGE[ev.type]}`}>{TYPE_LABEL_JA[ev.type]}</span></span>
                    <span className="text-muted cell-mono">{ev.source || 'manual'}</span>
                    <span className="text-muted">{ev.note || ''}</span>
                  </div>
                ))
              )}

              {detailRec?.note && (
                <div style={{
                  marginTop: 14, padding: 12, background: 'var(--bg-soft)',
                  border: '1px solid var(--border)', borderRadius: 6, fontSize: 13,
                }}>
                  <b>備考:</b> {detailRec.note}
                </div>
              )}
              {/* 注意: admin_note は本人画面に絶対表示しない */}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDetailDate(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
