'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { IS_DEMO, apiGetSession, apiGetEmployee, apiGetLeaves, apiSubmitLeave, apiWithdrawLeave } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { dowJa } from '@/lib/format'
import type { Employee, LeaveRequest, LeaveType } from '@/types/db'

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
  if (!l.from_date || !l.to_date) return 0
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

function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

export default function LeavesPage() {
  const [empId, setEmpId] = useState('')
  const [emp, setEmp] = useState<Employee | null>(null)
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [formType, setFormType] = useState<LeaveType>('paid')
  const [formFrom, setFormFrom] = useState('')
  const [formTo, setFormTo] = useState('')
  const [formReason, setFormReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    let currentEmpId = ''
    if (IS_DEMO) {
      const sessRes = await apiGetSession()
      const sessData = await sessRes.json()
      if (!sessData.session || sessData.session.type !== 'user') return
      currentEmpId = sessData.session.empId
    } else {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      currentEmpId = session.user.app_metadata?.emp_id
    }
    setEmpId(currentEmpId)

    if (IS_DEMO) {
      const empRes = await apiGetEmployee(currentEmpId)
      const empJson = await empRes.json()
      setEmp(empJson.data as Employee | null)

      const leaveRes = await apiGetLeaves(currentEmpId)
      const leaveJson = await leaveRes.json()
      setLeaves((leaveJson.data || []) as LeaveRequest[])
    } else {
      const supabase = createClient()
      const { data: empData } = await supabase
        .from('employees').select('*').eq('id', currentEmpId).single()
      setEmp(empData as Employee | null)

      const { data: leavesData } = await supabase
        .from('leave_requests').select('*')
        .eq('emp_id', currentEmpId).order('submitted_at', { ascending: false })
      setLeaves((leavesData || []) as LeaveRequest[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const approvedPaidDays = useMemo(() => {
    return leaves
      .filter(l => l.status === 'approved' && l.type.startsWith('paid'))
      .reduce((sum, l) => sum + leaveDays(l), 0)
  }, [leaves])

  const totalPaid = emp?.paid_leave_total || 0
  const usedPaid = emp?.paid_leave_used || 0
  const remainingPaid = totalPaid - usedPaid - approvedPaidDays
  const requiredPaid = Math.max(0, 5 - usedPaid - approvedPaidDays)

  const openLeaveModal = () => {
    setFormType('paid')
    setFormFrom(todayStr())
    setFormTo(todayStr())
    setFormReason('')
    setShowModal(true)
  }

  const formDays = leaveDays({ type: formType, from_date: formFrom, to_date: formTo })

  const handleSubmit = async () => {
    if (!formFrom || !formTo) { showToast('日付を入力してください', 'error'); return }
    if (formFrom > formTo) { showToast('開始日が終了日より後です', 'error'); return }
    if (!formReason.trim()) { showToast('理由を入力してください', 'error'); return }

    setSubmitting(true)
    if (IS_DEMO) {
      const res = await apiSubmitLeave({
        empId, empName: emp?.name || '',
        type: formType, fromDate: formFrom, toDate: formTo,
        reason: formReason.trim(),
      })
      if (!res.ok) {
        showToast('申請に失敗しました', 'error')
        setSubmitting(false)
        return
      }
    } else {
      const supabase = createClient()
      const { error } = await supabase.from('leave_requests').insert({
        emp_id: empId,
        emp_name: emp?.name || '',
        type: formType,
        from_date: formFrom,
        to_date: formTo,
        reason: formReason.trim(),
        status: 'pending',
        submitted_at: new Date().toISOString(),
      })
      if (error) {
        showToast('申請に失敗しました: ' + error.message, 'error')
        setSubmitting(false)
        return
      }
    }
    showToast('休暇申請を送信しました', 'success')
    setShowModal(false)
    await loadAll()
    setSubmitting(false)
  }

  const handleWithdraw = async (id: string) => {
    if (!confirm('この休暇申請を取り消しますか？')) return
    if (IS_DEMO) {
      await apiWithdrawLeave(id)
    } else {
      const supabase = createClient()
      await supabase.from('leave_requests').update({
        status: 'withdrawn',
        withdrawn_at: new Date().toISOString(),
      }).eq('id', id)
    }
    showToast('申請を取り消しました', 'info')
    await loadAll()
  }

  const today = new Date()
  const greetingMeta = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 (${dowJa(today)})`

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">休暇申請</span>
          <span className="page-title-en">LEAVE REQUESTS</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">{emp?.name || '--'}</span>さん、お疲れ様です。
          </div>
          <div className="greeting-meta">
            <span>{greetingMeta}</span>
            <span className="greeting-meta-en"> / {empId || '--'}</span>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card color-blue">
          <div className="stat-icon-box"><svg><use href="#i-calendar" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">付与日数</span>
              <span className="stat-label-en">TOTAL</span>
            </div>
            <div className="stat-value">{totalPaid}<span className="stat-unit">日</span></div>
          </div>
        </div>
        <div className="stat-card color-orange">
          <div className="stat-icon-box"><svg><use href="#i-list" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">消化日数</span>
              <span className="stat-label-en">USED</span>
            </div>
            <div className="stat-value">{(usedPaid + approvedPaidDays).toFixed(1)}<span className="stat-unit">日</span></div>
          </div>
        </div>
        <div className="stat-card color-green">
          <div className="stat-icon-box"><svg><use href="#i-check" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">残日数</span>
              <span className="stat-label-en">REMAINING</span>
            </div>
            <div className="stat-value">{remainingPaid.toFixed(1)}<span className="stat-unit">日</span></div>
          </div>
        </div>
        <div className="stat-card color-purple">
          <div className="stat-icon-box"><svg><use href="#i-warning" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">取得義務 (年5日)</span>
              <span className="stat-label-en">REQUIRED</span>
            </div>
            <div className="stat-value">{requiredPaid.toFixed(1)}<span className="stat-unit">日</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">申請一覧</span>
            <span className="card-title-en">MY LEAVE REQUESTS</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openLeaveModal}>
            <svg className="icon-svg-sm"><use href="#i-plus" /></svg>新規申請
          </button>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : leaves.length === 0 ? (
              <div className="empty-state">
                <svg className="icon-svg-lg empty-state-icon"><use href="#i-calendar" /></svg>
                <div>休暇申請はまだありません</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>申請日時 / Submitted</th>
                    <th>休暇種別 / Type</th>
                    <th>期間 / Period</th>
                    <th>日数 / Days</th>
                    <th>理由 / Reason</th>
                    <th>状態 / Status</th>
                    <th>操作 / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map(l => (
                    <tr key={l.id} style={l.status === 'withdrawn' ? { opacity: 0.55 } : undefined}>
                      <td className="cell-mono">{new Date(l.submitted_at).toLocaleString('ja-JP')}</td>
                      <td><span className="badge badge-purple">{LEAVE_TYPE_LABEL[l.type]}</span></td>
                      <td className="cell-mono">
                        {l.from_date}{l.from_date !== l.to_date ? ` 〜 ${l.to_date}` : ''}
                      </td>
                      <td className="cell-mono">{leaveDays(l)}日</td>
                      <td>{l.reason || '-'}</td>
                      <td>{statusBadge(l.status)}</td>
                      <td>
                        {l.status === 'pending' && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleWithdraw(l.id)}>取消</button>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">休暇申請 / Leave Request</div>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <svg className="icon-svg-sm"><use href="#i-x" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>
                  <span className="lbl-ja">休暇種別 *</span>
                  <span className="lbl-en">TYPE</span>
                </label>
                <select value={formType} onChange={e => setFormType(e.target.value as LeaveType)}>
                  <option value="paid">有給休暇 / Paid Leave</option>
                  <option value="paid_am">有給休暇 (午前半休)</option>
                  <option value="paid_pm">有給休暇 (午後半休)</option>
                  <option value="sick">病気休暇 / Sick Leave</option>
                  <option value="special">特別休暇 / Special</option>
                  <option value="absence">欠勤 / Absence</option>
                </select>
              </div>
              <div className="row">
                <div className="field">
                  <label>
                    <span className="lbl-ja">開始日 *</span>
                    <span className="lbl-en">FROM</span>
                  </label>
                  <input type="date" value={formFrom} onChange={e => setFormFrom(e.target.value)} />
                </div>
                <div className="field">
                  <label>
                    <span className="lbl-ja">終了日 *</span>
                    <span className="lbl-en">TO</span>
                  </label>
                  <input type="date" value={formTo} onChange={e => setFormTo(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>
                  <span className="lbl-ja">理由 *</span>
                  <span className="lbl-en">REASON</span>
                </label>
                <textarea
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  placeholder="例: 私用のため"
                />
              </div>
              <div style={{
                fontSize: 12, color: 'var(--text-muted)', padding: '10px 14px',
                background: 'var(--bg-soft)', borderRadius: 6,
              }}>
                日数: <b>{formDays}日</b>
                {formType.startsWith('paid') && (
                  <>
                    {' '}／ 残有給: <b>{remainingPaid.toFixed(1)}日</b>
                    {formDays > remainingPaid && (
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                        {' '}（残日数を超えています）
                      </span>
                    )}
                  </>
                )}
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
