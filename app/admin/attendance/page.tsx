'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { adminSelect, adminUpdateAdminNote } from '@/lib/api'
import { calcDay, sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes, dowJa } from '@/lib/format'
import { useCachedState, hasCached, getCached, setCached, clearCache } from '@/lib/cache'
import type { Employee, Attendance, AttendanceEvent, AttendanceEventType } from '@/types/db'

const CK = 'admin-attendance:'

const TYPE_LABEL: Record<AttendanceEventType, string> = {
  in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
}
const TYPE_BADGE: Record<AttendanceEventType, string> = {
  in: 'badge-orange', break_start: 'badge-warning', break_end: 'badge-teal', out: 'badge-success',
}

interface Row {
  date: string
  rec: Attendance | null
}

function AttendancePageInner() {
  const searchParams = useSearchParams()
  const initialEmp = searchParams.get('emp') || ''

  const [employees, setEmployees] = useCachedState<Employee[]>(CK + 'employees', [])
  const [selectedEmp, setSelectedEmp] = useState(initialEmp)
  const [monthStr, setMonthStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [rows, setRows] = useState<Row[]>(() => {
    const k = `${CK}rows:${initialEmp}:${(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()}`
    return getCached<Row[]>(k) ?? []
  })
  const [loading, setLoading] = useState<boolean>(() => !hasCached(CK + 'employees'))
  const [detail, setDetail] = useState<{ rec: Attendance | null; emp: Employee | null; date: string } | null>(null)
  const [adminNote, setAdminNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [editPunches, setEditPunches] = useState<{ type: AttendanceEventType; time: string }[]>([])
  const [savingPunches, setSavingPunches] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadEmployees = useCallback(async () => {
    const { data } = await adminSelect<Employee[]>({
      table: 'employees',
      filters: { status: 'active' },
      order: { column: 'id' },
    })
    const list = data || []
    setEmployees(list)
    if (!selectedEmp && list.length > 0) setSelectedEmp(list[0].id)
  }, [selectedEmp])

  useEffect(() => { loadEmployees() }, [loadEmployees])

  const loadMonth = useCallback(async () => {
    if (!selectedEmp) {
      setRows([])
      setLoading(false)
      return
    }
    const cacheKey = `${CK}rows:${selectedEmp}:${monthStr}`
    const cached = getCached<Row[]>(cacheKey)
    if (cached) {
      setRows(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    const [y, m] = monthStr.split('-').map(Number)
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const recordMap: Record<string, Attendance> = {}
    const { data } = await adminSelect<Attendance[]>({
      table: 'attendance',
      filters: { emp_id: selectedEmp },
      gte: { column: 'date', value: startDate },
      lte: { column: 'date', value: endDate },
    })
    ;(data || []).forEach(r => { recordMap[r.date] = r })

    const list: Row[] = []
    for (let i = 1; i <= lastDay; i++) {
      const d = `${y}-${String(m).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      list.push({ date: d, rec: recordMap[d] || null })
    }
    setRows(list)
    setCached(cacheKey, list)
    setLoading(false)
  }, [selectedEmp, monthStr])

  useEffect(() => { loadMonth() }, [loadMonth])

  const monthOptions = (() => {
    const today = new Date()
    const opts: { value: string; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      opts.push({ value: v, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
    }
    return opts
  })()

  const openDetail = (date: string, rec: Attendance | null) => {
    const emp = employees.find(e => e.id === selectedEmp) || null
    setDetail({ date, rec, emp })
    setAdminNote(rec?.admin_note || '')
    const initial = rec
      ? sortedEvents(rec.events as AttendanceEvent[])
          .filter(e => !e.cancelled)
          .map(e => ({
            type: e.type,
            time: new Date(e.time).toLocaleTimeString('ja-JP', {
              timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit',
            }),
          }))
      : []
    setEditPunches(initial)
  }

  const addPunch = (type: AttendanceEventType) => {
    setEditPunches(prev => [...prev, { type, time: '' }])
  }
  const updatePunch = (idx: number, time: string) => {
    setEditPunches(prev => prev.map((p, i) => i === idx ? { ...p, time } : p))
  }
  const updatePunchType = (idx: number, type: AttendanceEventType) => {
    setEditPunches(prev => prev.map((p, i) => i === idx ? { ...p, type } : p))
  }
  const removePunch = (idx: number) => {
    setEditPunches(prev => prev.filter((_, i) => i !== idx))
  }

  const savePunches = async () => {
    if (!detail) return
    if (editPunches.some(p => !p.time)) {
      showToast('時刻が未入力の打刻があります', 'error')
      return
    }
    setSavingPunches(true)
    const sorted = [...editPunches].sort((a, b) => a.time.localeCompare(b.time))
    const events = sorted.map(p => ({
      type: p.type,
      time: new Date(`${detail.date}T${p.time}:00+09:00`).toISOString(),
      source: 'admin-edit' as const,
    }))
    const res = await fetch('/api/admin/attendance/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emp_id: selectedEmp, date: detail.date, events }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(data.error || '保存失敗', 'error')
      setSavingPunches(false)
      return
    }
    showToast('打刻を更新しました', 'success')
    setSavingPunches(false)
    setDetail(null)
    clearCache(`${CK}rows:`)
    await loadMonth()
  }

  const saveAdminNote = async () => {
    if (!detail) return
    setSavingNote(true)
    const res = await adminUpdateAdminNote(selectedEmp, detail.date, adminNote)
    if (!res.ok) {
      const data = await res.json()
      showToast(data.error || '保存失敗', 'error')
      setSavingNote(false)
      return
    }
    showToast('管理者メモを保存しました', 'success')
    setSavingNote(false)
    await loadMonth()
    const updatedRec = rows.find(r => r.date === detail.date)?.rec || null
    setDetail({ ...detail, rec: updatedRec })
  }

  const selectedEmpInfo = employees.find(e => e.id === selectedEmp)

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">勤怠一覧</span>
          <span className="page-title-en">ATTENDANCE RECORDS</span>
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
            <span className="card-title">勤怠データ</span>
            <span className="card-title-en">RECORDS</span>
          </div>
        </div>
        <div className="card-body">
          <div className="toolbar">
            <select value={selectedEmp} onChange={e => setSelectedEmp(e.target.value)}>
              {employees.length === 0 ? (
                <option value="">従業員未登録</option>
              ) : (
                employees.map(e => (
                  <option key={e.id} value={e.id}>{e.id} / {e.name}</option>
                ))
              )}
            </select>
            <select value={monthStr} onChange={e => setMonthStr(e.target.value)}>
              {monthOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="spacer"></div>
            <button className="btn btn-sm" onClick={loadMonth}>↻ 更新</button>
          </div>

          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : rows.length === 0 ? (
              <div className="empty-state">表示するデータがありません</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>日付 / Date</th>
                    <th>社員 / Emp</th>
                    <th>初回出勤</th>
                    <th>最終退勤</th>
                    <th>打刻数</th>
                    <th>休憩</th>
                    <th>実働</th>
                    <th>状態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ date, rec }) => {
                    const calc = rec ? calcDay(rec.events as AttendanceEvent[]) : null
                    const d = new Date(date + 'T00:00:00+09:00')
                    let statusBadge: React.ReactNode = null
                    if (calc?.isWorking || calc?.isOnBreak) {
                      statusBadge = <span className="badge badge-warning">勤務中</span>
                    } else if (calc?.firstIn && calc.lastOut) {
                      statusBadge = <span className="badge badge-success">完了</span>
                    } else if (calc?.firstIn) {
                      statusBadge = <span className="badge badge-warning">未退勤</span>
                    }
                    return (
                      <tr key={date}>
                        <td className="cell-mono">{date} ({dowJa(d)})</td>
                        <td className="cell-mono">{selectedEmpInfo?.id}</td>
                        <td className="cell-mono">{calc?.firstIn ? fmtTimeShort(calc.firstIn) : '-'}</td>
                        <td className="cell-mono">{calc?.lastOut ? fmtTimeShort(calc.lastOut) : '-'}</td>
                        <td className="cell-mono">{calc?.eventCount || 0}</td>
                        <td className="cell-mono">{calc?.totalBreak ? `${calc.totalBreak}分` : '-'}</td>
                        <td className="cell-mono">{calc?.totalWorked ? formatMinutes(calc.totalWorked) : '-'}</td>
                        <td>
                          {statusBadge}
                          {rec?.admin_note && <span className="badge badge-warning" style={{ marginLeft: 4 }}>📝メモ</span>}
                        </td>
                        <td>
                          <button className="btn btn-sm" onClick={() => openDetail(date, rec)}>詳細</button>
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

      {detail && (
        <div className="modal-overlay show" onClick={() => setDetail(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">打刻詳細 / Detail</div>
              <button className="modal-close" onClick={() => setDetail(null)}>
                <svg className="icon-svg-sm"><use href="#i-x" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16, fontWeight: 700, fontSize: 16 }}>
                {detail.date} ({dowJa(new Date(detail.date + 'T00:00:00+09:00'))}) / {detail.emp?.name || selectedEmp}
              </div>

              <div className="punch-list-header">
                <span className="punch-list-header-label">打刻編集 / EDIT PUNCHES</span>
                <div className="punch-list-header-actions">
                  <button type="button" className="btn btn-sm" onClick={() => addPunch('in')}>
                    <svg className="icon-svg-sm"><use href="#i-plus" /></svg>出勤
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => addPunch('break_start')}>
                    <svg className="icon-svg-sm"><use href="#i-plus" /></svg>休憩開始
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => addPunch('break_end')}>
                    <svg className="icon-svg-sm"><use href="#i-plus" /></svg>休憩終了
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => addPunch('out')}>
                    <svg className="icon-svg-sm"><use href="#i-plus" /></svg>退勤
                  </button>
                </div>
              </div>
              <div className="punch-list">
                {editPunches.length === 0 ? (
                  <div className="text-muted text-center" style={{ padding: 18, fontSize: 12 }}>
                    打刻がありません。上のボタンから追加してください。
                  </div>
                ) : (
                  editPunches.map((p, idx) => (
                    <div className="punch-row" key={idx}>
                      <select
                        value={p.type}
                        onChange={e => updatePunchType(idx, e.target.value as AttendanceEventType)}
                        className={`badge ${TYPE_BADGE[p.type]}`}
                        style={{ minWidth: 96, padding: '3px 8px', border: 'none', borderRadius: 12 }}
                      >
                        <option value="in">出勤</option>
                        <option value="break_start">休憩開始</option>
                        <option value="break_end">休憩終了</option>
                        <option value="out">退勤</option>
                      </select>
                      <input
                        type="time"
                        value={p.time}
                        onChange={e => updatePunch(idx, e.target.value)}
                      />
                      <span className="punch-row-num">#{idx + 1}</span>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removePunch(idx)} aria-label="削除">
                        <svg className="icon-svg-sm"><use href="#i-trash" /></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={savePunches} disabled={savingPunches}>
                  <svg className="icon-svg-sm"><use href="#i-check" /></svg>
                  {savingPunches ? '保存中...' : '打刻を保存'}
                </button>
              </div>

              {detail.rec && (detail.rec.events as AttendanceEvent[]).filter(e => e.cancelled).length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                    取消済み打刻も表示 ({(detail.rec.events as AttendanceEvent[]).filter(e => e.cancelled).length}件)
                  </summary>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    {sortedEvents(detail.rec.events as AttendanceEvent[]).filter(e => e.cancelled).map((ev, i) => (
                      <div key={i} style={{ textDecoration: 'line-through', padding: '3px 0' }}>
                        {fmtTimeShort(ev.time)} {TYPE_LABEL[ev.type]} ({ev.source || 'manual'})
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* 管理者専用備考 */}
              <div style={{
                marginTop: 16, padding: 14, background: '#fff8e6',
                border: '1px solid var(--yellow)', borderLeft: '4px solid var(--yellow)', borderRadius: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg className="icon-svg-sm" style={{ color: 'var(--yellow)' }}>
                      <use href="#i-warning" />
                    </svg>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#876600', letterSpacing: '0.04em' }}>
                      管理者専用備考 / ADMIN NOTE
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.1em' }}>
                      PRIVATE
                    </span>
                  </div>
                  {detail.rec?.admin_note_updated_at && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                      更新: {new Date(detail.rec.admin_note_updated_at).toLocaleString('ja-JP')}
                    </span>
                  )}
                </div>
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  style={{
                    width: '100%', minHeight: 70, padding: '10px 12px',
                    border: '1px solid var(--border-strong)',
                    fontFamily: "'Shippori Mincho', serif", fontSize: 13, borderRadius: 6,
                    background: 'white', resize: 'vertical',
                  }}
                  placeholder="管理者だけが見れる備考。承認や修正の経緯、内部メモなどを記録できます。"
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    ※ この備考は一般ユーザーには表示されません
                  </span>
                  <button className="btn btn-primary btn-sm" onClick={saveAdminNote} disabled={savingNote}>
                    <svg className="icon-svg-sm"><use href="#i-check" /></svg>
                    {savingNote ? '保存中...' : '備考を保存'}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setDetail(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast show ${toast.type}`}>
          <span className="toast-msg">{toast.msg}</span>
        </div>
      )}
    </section>
  )
}

export default function AdminAttendancePage() {
  return (
    <Suspense fallback={<div className="empty-state">読み込み中...</div>}>
      <AttendancePageInner />
    </Suspense>
  )
}
