'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetLeaves, apiApproveLeave, apiRejectLeave } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import type { LeaveRequest, LeaveType, LeaveRequestStatus } from '@/types/db'

const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  paid: '有給休暇',
  paid_am: '有給(午前半休)',
  paid_pm: '有給(午後半休)',
  sick: '病気休暇',
  special: '特別休暇',
  absence: '欠勤',
}

function leaveDays(l: { type: LeaveType; from_date: string; to_date: string }): number {
  if (l.type === 'paid_am' || l.type === 'paid_pm') return 0.5
  const from = new Date(l.from_date)
  const to = new Date(l.to_date)
  return Math.floor((to.getTime() - from.getTime()) / 86400000) + 1
}

function statusBadge(status: string) {
  if (status === 'pending') return <span className="badge badge-warning">承認待ち</span>
  if (status === 'approved') return <span className="badge badge-success">承認済</span>
  if (status === 'rejected') return <span className="badge badge-danger">却下</span>
  if (status === 'withdrawn') return <span className="badge badge-info">取下げ</span>
  return <span className="badge badge-info">{status}</span>
}

export default function AdminLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus | 'all'>('pending')
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
      const res = await apiGetLeaves(undefined, statusFilter === 'all' ? undefined : statusFilter)
      const data = await res.json()
      setLeaves((data.data || []) as LeaveRequest[])
    } else {
      const supabase = createClient()
      let query = supabase.from('leave_requests').select('*').order('submitted_at', { ascending: false })
      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      const { data } = await query
      setLeaves((data || []) as LeaveRequest[])
    }
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const handleApprove = async (l: LeaveRequest) => {
    if (!confirm(`${l.emp_name} (${l.emp_id}) ${l.from_date}〜${l.to_date} の休暇申請を承認しますか？`)) return
    setSubmitting(true)
    if (IS_DEMO) {
      const res = await apiApproveLeave(l.id)
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || '承認失敗', 'error')
        setSubmitting(false)
        return
      }
    } else {
      const supabase = createClient()
      await supabase.from('leave_requests').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
      }).eq('id', l.id)

      // 有給の場合は paid_leave_used を更新（承認済み合算で算出するなら不要、ここでは即時加算）
      if (l.type.startsWith('paid')) {
        const { data: emp } = await supabase
          .from('employees').select('paid_leave_used').eq('id', l.emp_id).single()
        if (emp) {
          await supabase
            .from('employees')
            .update({ paid_leave_used: (emp.paid_leave_used || 0) + leaveDays(l) })
            .eq('id', l.emp_id)
        }
      }
    }
    showToast('休暇申請を承認しました', 'success')
    await load()
    setSubmitting(false)
  }

  const handleConfirmReject = async () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) { showToast('却下理由を入力してください', 'error'); return }
    setSubmitting(true)
    if (IS_DEMO) {
      const res = await apiRejectLeave(rejectingId, rejectReason.trim())
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || '却下失敗', 'error')
        setSubmitting(false)
        return
      }
    } else {
      const supabase = createClient()
      await supabase.from('leave_requests').update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: 'admin',
        reject_reason: rejectReason.trim(),
      }).eq('id', rejectingId)
    }
    showToast('休暇申請を却下しました', 'info')
    setRejectingId(null)
    await load()
    setSubmitting(false)
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">休暇承認</span>
          <span className="page-title-en">LEAVE APPROVALS</span>
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
            <span className="card-title">休暇申請一覧</span>
            <span className="card-title-en">ALL LEAVE REQUESTS</span>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as LeaveRequestStatus | 'all')}>
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
            ) : leaves.length === 0 ? (
              <div className="empty-state">
                <svg className="icon-svg-lg empty-state-icon" style={{ color: 'var(--green)' }}>
                  <use href="#i-check" />
                </svg>
                <div>該当する申請はありません</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>申請日時</th>
                    <th>申請者</th>
                    <th>休暇種別</th>
                    <th>期間</th>
                    <th>日数</th>
                    <th>理由</th>
                    <th>状態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map(l => (
                    <tr key={l.id}>
                      <td className="cell-mono">{new Date(l.submitted_at).toLocaleString('ja-JP')}</td>
                      <td>{l.emp_name} <span className="text-muted cell-mono">({l.emp_id})</span></td>
                      <td><span className="badge badge-purple">{LEAVE_TYPE_LABEL[l.type]}</span></td>
                      <td className="cell-mono">
                        {l.from_date}{l.from_date !== l.to_date ? ` 〜 ${l.to_date}` : ''}
                      </td>
                      <td className="cell-mono">{leaveDays(l)}日</td>
                      <td>{l.reason || '-'}</td>
                      <td>{statusBadge(l.status)}</td>
                      <td>
                        {l.status === 'pending' ? (
                          <div className="action-buttons">
                            <button className="btn btn-success btn-sm" onClick={() => handleApprove(l)} disabled={submitting}>
                              <svg className="icon-svg-sm"><use href="#i-check" /></svg>承認
                            </button>
                            <button className="btn btn-danger btn-sm" onClick={() => { setRejectingId(l.id); setRejectReason('') }} disabled={submitting}>
                              <svg className="icon-svg-sm"><use href="#i-x" /></svg>却下
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 11 }}>
                            {l.reviewed_at ? new Date(l.reviewed_at).toLocaleString('ja-JP') : ''}
                            {l.reject_reason && (<><br />却下理由: {l.reject_reason}</>)}
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
                  placeholder="例: 該当期間に重要な業務予定があるため。"
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
