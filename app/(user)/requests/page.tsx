'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { IS_DEMO, apiGetSession, apiGetAttendance, apiGetCorrections, apiSubmitCorrection, apiWithdrawCorrection, userSelect } from '@/lib/api'
import { sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, dowJa } from '@/lib/format'
import { useCachedState, hasCached } from '@/lib/cache'
import type { CorrectionRequest, AttendanceEvent, AttendanceEventType, Attendance } from '@/types/db'

const CK = 'user-requests:'

const TYPE_LABEL: Record<AttendanceEventType, string> = {
  in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
}
const TYPE_BADGE: Record<AttendanceEventType, string> = {
  in: 'badge-orange', break_start: 'badge-warning', break_end: 'badge-teal', out: 'badge-success',
}

interface PunchEntry {
  type: AttendanceEventType
  time: string  // "HH:MM"
}

function statusBadge(status: string) {
  if (status === 'pending') return <span className="badge badge-warning">承認待ち</span>
  if (status === 'approved') return <span className="badge badge-success">承認済</span>
  if (status === 'rejected') return <span className="badge badge-danger">却下</span>
  if (status === 'withdrawn') return <span className="badge badge-info">取下げ</span>
  return <span className="badge badge-info">{status}</span>
}

function formatRequestEvents(events: AttendanceEvent[]): string {
  if (!events || events.length === 0) return '-'
  return events.map(e => `${TYPE_LABEL[e.type]} ${fmtTimeShort(e.time)}`).join(' / ')
}

function RequestsPageInner() {
  const searchParams = useSearchParams()
  const initialDate = searchParams.get('date') || ''

  const [empId, setEmpId] = useCachedState<string>(CK + 'empId', '')
  const [empName, setEmpName] = useCachedState<string>(CK + 'empName', '')
  const [requests, setRequests] = useCachedState<CorrectionRequest[]>(CK + 'requests', [])
  const [loading, setLoading] = useState<boolean>(() => !hasCached(CK + 'requests'))
  const [showModal, setShowModal] = useState(false)
  const [targetDate, setTargetDate] = useState('')
  const [punches, setPunches] = useState<PunchEntry[]>([])
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadRequests = useCallback(async (currentEmpId: string) => {
    if (IS_DEMO) {
      const res = await apiGetCorrections(currentEmpId)
      const data = await res.json()
      setRequests((data.data || []) as CorrectionRequest[])
    } else {
      const { data } = await userSelect<CorrectionRequest[]>({
        table: 'correction_requests',
        order: { column: 'submitted_at', ascending: false },
      })
      setRequests(data || [])
    }
  }, [setRequests])

  const openCorrectionForDate = useCallback(async (dateStr: string, currentEmpId: string) => {
    if (!currentEmpId) return
    setTargetDate(dateStr)
    setReason('')

    let events: AttendanceEvent[] = []
    if (IS_DEMO) {
      const res = await apiGetAttendance(currentEmpId, dateStr, dateStr)
      const data = await res.json()
      events = data.data?.[0]?.events || []
    } else {
      const { data } = await userSelect<Attendance>({
        table: 'attendance',
        columns: 'events',
        filters: { date: dateStr },
        single: true,
      })
      events = (data?.events as AttendanceEvent[]) || []
    }

    const initialPunches: PunchEntry[] = sortedEvents(events)
      .filter(e => !e.cancelled)
      .map(e => ({
        type: e.type,
        time: new Date(e.time).toLocaleTimeString('ja-JP', {
          timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit',
        }),
      }))
    setPunches(initialPunches)
    setShowModal(true)
  }, [])

  const fetchInit = useCallback(async () => {
    if (!hasCached(CK + 'requests')) setLoading(true)
    let currentEmpId = ''
    let name = ''
    if (IS_DEMO) {
      const sessRes = await apiGetSession()
      const sessData = await sessRes.json()
      if (!sessData.session || sessData.session.type !== 'user') return
      currentEmpId = sessData.session.empId
      name = sessData.session.name || ''
    } else {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      const meData = await meRes.json()
      if (!meData.session) return
      currentEmpId = meData.session.empId
      name = meData.session.name || ''
    }
    setEmpId(currentEmpId)
    setEmpName(name)
    await loadRequests(currentEmpId)
    setLoading(false)

    if (initialDate) await openCorrectionForDate(initialDate, currentEmpId)
  }, [loadRequests, initialDate, openCorrectionForDate, setEmpId, setEmpName])

  useEffect(() => { fetchInit() }, [fetchInit])

  const handleNewRequest = () => {
    const today = new Date()
    const dateStr = today.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    openCorrectionForDate(dateStr, empId)
  }

  const handleAddPunch = (type: AttendanceEventType) => {
    setPunches(prev => [...prev, { type, time: '' }])
  }
  const handleUpdatePunch = (idx: number, time: string) => {
    setPunches(prev => prev.map((p, i) => i === idx ? { ...p, time } : p))
  }
  const handleRemovePunch = (idx: number) => {
    setPunches(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    const trimmedReason = reason.trim()
    if (!trimmedReason) { showToast('修正理由を入力してください', 'error'); return }
    if (punches.some(p => !p.time)) { showToast('時刻が未入力の打刻があります', 'error'); return }

    setSubmitting(true)
    const sortedPunches = [...punches].sort((a, b) => a.time.localeCompare(b.time))
    const requestedEvents: AttendanceEvent[] = sortedPunches.map(p => ({
      type: p.type,
      time: new Date(`${targetDate}T${p.time}:00+09:00`).toISOString(),
      source: 'request',
    }))

    if (IS_DEMO) {
      const res = await apiSubmitCorrection({
        empId, empName, date: targetDate,
        requestedEvents, reason: trimmedReason,
      })
      if (!res.ok) {
        showToast('申請に失敗しました', 'error')
        setSubmitting(false)
        return
      }
    } else {
      const res = await fetch('/api/user/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          requested_events: requestedEvents,
          reason: trimmedReason,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('申請に失敗しました: ' + (data.error || '不明'), 'error')
        setSubmitting(false)
        return
      }
    }
    showToast('修正申請を送信しました', 'success')
    setShowModal(false)
    await loadRequests(empId)
    setSubmitting(false)
  }

  const handleWithdraw = async (id: string) => {
    if (!confirm('この修正申請を取り消しますか？\nログは記録として残ります。')) return
    if (IS_DEMO) {
      await apiWithdrawCorrection(id)
    } else {
      const res = await fetch(`/api/user/corrections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'withdraw' }),
      })
      if (!res.ok) {
        const data = await res.json()
        showToast('取り消し失敗: ' + (data.error || '不明'), 'error')
        return
      }
    }
    showToast('申請を取り消しました', 'info')
    await loadRequests(empId)
  }

  const today = new Date()
  const greetingMeta = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 (${dowJa(today)})`

  // 表示用に時間順ソート（idxは元配列保持のために別途管理）
  const sortedPunchView = [...punches]
    .map((p, idx) => ({ ...p, idx }))
    .sort((a, b) => {
      if (!a.time) return 1
      if (!b.time) return -1
      return a.time.localeCompare(b.time)
    })

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">修正申請</span>
          <span className="page-title-en">CORRECTION REQUESTS</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">{empName || '--'}</span>さん、お疲れ様です。
          </div>
          <div className="greeting-meta">
            <span>{greetingMeta}</span>
            <span className="greeting-meta-en"> / {empId || '--'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">申請一覧</span>
            <span className="card-title-en">MY REQUESTS</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleNewRequest}>
            <svg className="icon-svg-sm"><use href="#i-plus" /></svg>
            新規申請
          </button>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : requests.length === 0 ? (
              <div className="empty-state">
                <svg className="icon-svg-lg empty-state-icon"><use href="#i-empty-mail" /></svg>
                <div>申請はまだありません</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>申請日時 / Submitted</th>
                    <th>対象日 / Date</th>
                    <th>修正内容 / Changes</th>
                    <th>理由 / Reason</th>
                    <th>状態 / Status</th>
                    <th>操作 / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} style={r.status === 'withdrawn' ? { opacity: 0.55 } : undefined}>
                      <td className="cell-mono">{new Date(r.submitted_at).toLocaleString('ja-JP')}</td>
                      <td className="cell-mono">{r.date}</td>
                      <td className="cell-mono">{formatRequestEvents(r.requested_events)}</td>
                      <td>{r.reason}</td>
                      <td>{statusBadge(r.status)}</td>
                      <td>
                        {r.status === 'pending' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleWithdraw(r.id)}>
                            <svg className="icon-svg-sm"><use href="#i-x" /></svg>取消
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay show" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">勤怠修正申請 / Correction Request</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <svg className="icon-svg-sm"><use href="#i-x" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>
                  <span className="lbl-ja">対象日</span>
                  <span className="lbl-en">DATE</span>
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{
                    margin: 0, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11, color: 'var(--text-soft)', letterSpacing: '0.08em',
                    textTransform: 'uppercase', fontWeight: 700,
                  }}>
                    打刻リスト（時系列）/ PUNCH LIST
                  </label>
                  <div className="gap-8">
                    <button type="button" className="btn btn-sm" onClick={() => handleAddPunch('in')}>
                      <svg className="icon-svg-sm"><use href="#i-plus" /></svg>出勤
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => handleAddPunch('break_start')}>
                      <svg className="icon-svg-sm"><use href="#i-plus" /></svg>休憩開始
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => handleAddPunch('break_end')}>
                      <svg className="icon-svg-sm"><use href="#i-plus" /></svg>休憩終了
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => handleAddPunch('out')}>
                      <svg className="icon-svg-sm"><use href="#i-plus" /></svg>退勤
                    </button>
                  </div>
                </div>
                <div className="punch-list">
                  {punches.length === 0 ? (
                    <div className="text-muted text-center" style={{ padding: 18, fontSize: 12 }}>
                      打刻がありません。上のボタンから追加してください。
                    </div>
                  ) : (
                    sortedPunchView.map((p, displayIdx) => (
                      <div className="punch-row" key={p.idx}>
                        <span className={`badge ${TYPE_BADGE[p.type]}`}>{TYPE_LABEL[p.type]}</span>
                        <input
                          type="time"
                          value={p.time}
                          onChange={e => handleUpdatePunch(p.idx, e.target.value)}
                        />
                        <span className="text-muted" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                          #{displayIdx + 1}
                        </span>
                        <span></span>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRemovePunch(p.idx)}>
                          <svg className="icon-svg-sm"><use href="#i-trash" /></svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="field">
                <label>
                  <span className="lbl-ja">修正理由 *</span>
                  <span className="lbl-en">REASON</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="例: 退勤後の再出勤打刻を忘れたため。実際の時刻は記載通りです。"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowModal(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '送信中...' : '申請する'}
              </button>
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

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="empty-state">読み込み中...</div>}>
      <RequestsPageInner />
    </Suspense>
  )
}
