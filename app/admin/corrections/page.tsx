'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetCorrections, apiApproveCorrection, apiRejectCorrection, adminSelect, adminApproveCorrection, adminRejectCorrection } from '@/lib/api'
import { fmtTimeShort } from '@/lib/format'
import type { CorrectionRequest, AttendanceEvent, AttendanceEventType, CorrectionRequestStatus } from '@/types/db'

const TYPE_LABEL: Record<AttendanceEventType, string> = {
  in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
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

export default function AdminCorrectionsPage() {
  const [requests, setRequests] = useState<CorrectionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<CorrectionRequestStatus | 'all'>('pending')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    if (IS_DEMO) {
      const res = await apiGetCorrections(undefined, statusFilter === 'all' ? undefined : statusFilter)
      const data = await res.json()
      setRequests((data.data || []) as CorrectionRequest[])
    } else {
      const { data } = await adminSelect<CorrectionRequest[]>({
        table: 'correction_requests',
        filters: statusFilter === 'all' ? undefined : { status: statusFilter },
        order: { column: 'submitted_at', ascending: false },
      })
      setRequests(data || [])
    }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const handleApprove = async (req: CorrectionRequest) => {
    if (!confirm(`${req.emp_name} (${req.emp_id}) ${req.date} の修正を承認しますか？\nこの操作で勤怠データが上書きされます。`)) return
    setSubmitting(true)
    if (IS_DEMO) {
      const res = await apiApproveCorrection(req.id)
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || '承認失敗', 'error')
        setSubmitting(false)
        return
      }
    } else {
      const res = await adminApproveCorrection(req.id)
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error || '承認失敗', 'error')
        setSubmitting(false)
        return
      }
    }
    showToast('修正を承認しました', 'success')
    await load()
    setSubmitting(false)
  }

  const handleOpenReject = (id: string) => {
    setRejectingId(id)
    setRejectReason('')
  }

  const handleConfirmReject = async () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) { showToast('却下理由を入力してください', 'error'); return }
    setSubmitting(true)
    if (IS_DEMO) {
      const res = await apiRejectCorrection(rejectingId, rejectReason.trim())
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || '却下失敗', 'error')
        setSubmitting(false)
        return
      }
    } else {
      const res = await adminRejectCorrection(rejectingId, rejectReason.trim())
      if (!res.ok) {
        const data = await res.json()
        showToast(data.error || '却下失敗', 'error')
        setSubmitting(false)
        return
      }
    }
    showToast('修正を却下しました', 'info')
    setRejectingId(null)
    await load()
    setSubmitting(false)
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">承認待ち申請</span>
          <span className="page-title-en">PENDING APPROVALS</span>
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
            <span className="card-title">修正申請一覧</span>
            <span className="card-title-en">CORRECTION REQUESTS</span>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as CorrectionRequestStatus | 'all')}>
            <option value="pending">承認待ちのみ</option>
            <option value="all">全件</option>
            <option value="approved">承認済</option>
            <option value="rejected">却下</option>
            <option value="withdrawn">取下げ</option>
          </select>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : requests.length === 0 ? (
              <div className="empty-state">
                <svg className="icon-svg-lg empty-state-icon" style={{ color: 'var(--green)' }}>
                  <use href="#i-check" />
                </svg>
                <div>承認待ちの申請はありません</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>申請日時</th>
                    <th>申請者</th>
                    <th>対象日</th>
                    <th>修正内容</th>
                    <th>理由</th>
                    <th>状態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td className="cell-mono">{new Date(r.submitted_at).toLocaleString('ja-JP')}</td>
                      <td>{r.emp_name} <span className="text-muted cell-mono">({r.emp_id})</span></td>
                      <td className="cell-mono">{r.date}</td>
                      <td className="cell-mono">{formatRequestEvents(r.requested_events)}</td>
                      <td>{r.reason}</td>
                      <td>{statusBadge(r.status)}</td>
                      <td>
                        {r.status === 'pending' ? (
                          <div className="action-buttons">
                            <button className="btn btn-success btn-sm" onClick={() => handleApprove(r)} disabled={submitting}>
                              <svg className="icon-svg-sm"><use href="#i-check" /></svg>承認
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleOpenReject(r.id)} disabled={submitting}>
                              <svg className="icon-svg-sm"><use href="#i-x" /></svg>却下
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('ja-JP') : ''}
                            {r.reject_reason && (<><br />却下理由: {r.reject_reason}</>)}
                          </span>
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

      {rejectingId && (
        <div className="modal-overlay show" onClick={() => setRejectingId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">却下理由 / Reject Reason</div>
              <button className="modal-close" onClick={() => setRejectingId(null)}>
                <svg className="icon-svg-sm"><use href="#i-x" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>
                  <span className="lbl-ja">却下理由 *</span>
                  <span className="lbl-en">REASON</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="例: 該当日は業務記録がなく、修正内容を確認できないため。"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRejectingId(null)}>キャンセル</button>
              <button className="btn btn-danger" onClick={handleConfirmReject} disabled={submitting}>
                {submitting ? '処理中...' : '却下する'}
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
