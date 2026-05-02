'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { adminSelect } from '@/lib/api'
import type { Employee } from '@/types/db'

function EmployeesPageInner() {
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formId, setFormId] = useState('')
  const [formPw, setFormPw] = useState('')
  const [formName, setFormName] = useState('')
  const [formKana, setFormKana] = useState('')
  const [formBirthday, setFormBirthday] = useState('')
  const [formDept, setFormDept] = useState('')
  const [formPosition, setFormPosition] = useState('')
  const [formPaidTotal, setFormPaidTotal] = useState(10)
  const [formPaidUsed, setFormPaidUsed] = useState(0)
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active')
  const [formResetPw, setFormResetPw] = useState('')
  const [resetMsg, setResetMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await adminSelect<Employee[]>({
      table: 'employees',
      order: { column: 'id' },
    })
    setEmployees(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openCreateModal = () => {
    setEditingId(null)
    setFormId('')
    setFormPw(generateInitialPassword())
    setFormName('')
    setFormKana('')
    setFormBirthday('')
    setFormDept('')
    setFormPosition('')
    setFormPaidTotal(10)
    setFormPaidUsed(0)
    setFormStatus('active')
    setFormResetPw('')
    setResetMsg('')
    setModalError('')
    setShowModal(true)
  }

  const openEditModal = useCallback((emp: Employee) => {
    setEditingId(emp.id)
    setFormId(emp.id)
    setFormPw('')
    setFormName(emp.name)
    setFormKana(emp.kana || '')
    setFormBirthday(emp.birthday || '')
    setFormDept(emp.dept || '')
    setFormPosition(emp.position || '')
    setFormPaidTotal(emp.paid_leave_total)
    setFormPaidUsed(emp.paid_leave_used)
    setFormStatus(emp.status)
    setFormResetPw('')
    setResetMsg('')
    setModalError('')
    setShowModal(true)
  }, [])

  // ?id=EMP001 で編集モーダルを直接開く
  useEffect(() => {
    if (!editId || loading) return
    const target = employees.find(e => e.id === editId)
    if (target) openEditModal(target)
  }, [editId, employees, loading, openEditModal])

  const handleSave = async () => {
    setModalError('')
    if (!formName.trim()) { setModalError('氏名を入力してください'); return }
    if (!editingId) {
      if (!formId.trim()) { setModalError('社員IDを入力してください'); return }
      if (!formPw.trim() || formPw.length < 4) { setModalError('初期パスワードは4文字以上で入力してください'); return }
    }
    setSubmitting(true)
    if (editingId) {
      const newIdInput = formId.trim().toUpperCase()
      const updates: Record<string, unknown> = {
        name: formName.trim(),
        kana: formKana.trim() || null,
        birthday: formBirthday || null,
        dept: formDept.trim() || null,
        position: formPosition.trim() || null,
        paid_leave_total: Number(formPaidTotal),
        paid_leave_used: Number(formPaidUsed),
        status: formStatus,
      }
      if (newIdInput && newIdInput !== editingId) {
        if (!confirm(
          `社員IDを ${editingId} → ${newIdInput} に変更します。\n` +
          `関連する勤怠/申請データも自動で新IDに紐付け直されます。\n` +
          `本人は次回ログインから新IDを使用してください。\n続行しますか？`
        )) {
          setSubmitting(false)
          return
        }
        updates.new_id = newIdInput
      }
      const res = await fetch(`/api/admin/employees/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) {
        setModalError(data.error || '更新に失敗しました')
        setSubmitting(false)
        return
      }
      showToast('従業員情報を更新しました', 'success')
    } else {
      const empPayload = {
        id: formId.trim().toUpperCase(),
        password: formPw,
        name: formName.trim(),
        kana: formKana.trim() || null,
        birthday: formBirthday || null,
        dept: formDept.trim() || null,
        position: formPosition.trim() || null,
        paid_leave_total: Number(formPaidTotal),
        paid_leave_used: Number(formPaidUsed),
      }
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(empPayload),
      })
      const data = await res.json()
      if (!res.ok) {
        setModalError(data.error || '登録に失敗しました')
        setSubmitting(false)
        return
      }
      showToast('従業員を登録しました', 'success')
    }
    setShowModal(false)
    await load()
    setSubmitting(false)
  }

  const handleResetPassword = async () => {
    if (!editingId) return
    if (!formResetPw || formResetPw.length < 4) {
      setResetMsg('4文字以上の新パスワードを入力してください')
      return
    }
    const res = await fetch(`/api/admin/employees/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_password: formResetPw }),
    })
    const data = await res.json()
    if (!res.ok) {
      setResetMsg(data.error || 'リセット失敗')
      return
    }
    setResetMsg(`新パスワード「${formResetPw}」を設定しました。次回ログイン時に本人がパスワード変更を求められます。`)
    setFormResetPw('')
  }

  const handleDelete = async () => {
    if (!editingId) return
    if (!confirm(`従業員 ${editingId} を退職扱いにしますか？\n（データは保持され、status=inactiveになります）`)) return
    const res = await fetch(`/api/admin/employees/${editingId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      showToast(data.error || '退職処理失敗', 'error')
      return
    }
    showToast('退職扱いにしました', 'info')
    setShowModal(false)
    await load()
  }

  const filtered = employees.filter(e => statusFilter === 'all' || e.status === statusFilter)

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">従業員管理</span>
          <span className="page-title-en">EMPLOYEES</span>
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
            <span className="card-title">従業員一覧 ({filtered.length}名)</span>
            <span className="card-title-en">EMPLOYEE LIST</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
            <svg className="icon-svg-sm"><use href="#i-plus" /></svg>
            新規登録
          </button>
        </div>
        <div className="card-body">
          <div className="toolbar">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
              <option value="active">在職のみ</option>
              <option value="inactive">退職のみ</option>
              <option value="all">全て</option>
            </select>
            <div className="spacer"></div>
          </div>
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <svg className="icon-svg-lg empty-state-icon"><use href="#i-users" /></svg>
                <div>該当する従業員はいません</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>社員ID</th>
                    <th>氏名</th>
                    <th>所属</th>
                    <th>役職</th>
                    <th>登録日</th>
                    <th>状態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id}>
                      <td className="cell-mono">{e.id}</td>
                      <td>
                        {e.name}
                        {e.first_login && (
                          <span className="badge badge-orange" style={{ marginLeft: 8 }}>未ログイン</span>
                        )}
                      </td>
                      <td>{e.dept || '-'}</td>
                      <td>{e.position || '-'}</td>
                      <td className="cell-mono">{new Date(e.created_at).toLocaleDateString('ja-JP')}</td>
                      <td>
                        {e.status === 'active'
                          ? <span className="badge badge-success">在職</span>
                          : <span className="badge badge-info">退職</span>}
                      </td>
                      <td>
                        <button className="btn btn-sm" onClick={() => openEditModal(e)}>
                          <svg className="icon-svg-sm"><use href="#i-edit" /></svg>
                          編集
                        </button>
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
              <div className="modal-title">
                {editingId ? '従業員情報の編集 / Edit Employee' : '新規従業員登録 / New Employee'}
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <svg className="icon-svg-sm"><use href="#i-x" /></svg>
              </button>
            </div>
            <div className="modal-body">
              {modalError && <div className="error-msg">{modalError}</div>}
              <div className="row">
                <div className="field">
                  <label>
                    <span className="lbl-ja">社員ID *</span>
                    <span className="lbl-en">ID</span>
                  </label>
                  <input
                    type="text"
                    value={formId}
                    onChange={e => setFormId(e.target.value)}
                    placeholder="社員ID（例: 任意の英数字）"
                  />
                  {editingId && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      ※ ID を変更すると勤怠/申請データも自動で新IDへ紐付け直されます。本人は次回ログインから新IDを使用。
                    </p>
                  )}
                </div>
                {!editingId && (
                  <div className="field">
                    <label>
                      <span className="lbl-ja">初期パスワード *</span>
                      <span className="lbl-en">INITIAL PW</span>
                    </label>
                    <input
                      type="text"
                      value={formPw}
                      onChange={e => setFormPw(e.target.value)}
                      placeholder="本人が初回ログイン時に変更"
                    />
                  </div>
                )}
              </div>
              <div className="field">
                <label>
                  <span className="lbl-ja">氏名 *</span>
                  <span className="lbl-en">NAME</span>
                </label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="山田 太郎" />
              </div>
              <div className="row">
                <div className="field">
                  <label>
                    <span className="lbl-ja">よみかな</span>
                    <span className="lbl-en">KANA</span>
                  </label>
                  <input type="text" value={formKana} onChange={e => setFormKana(e.target.value)} placeholder="やまだ たろう" />
                </div>
                <div className="field">
                  <label>
                    <span className="lbl-ja">生年月日</span>
                    <span className="lbl-en">BIRTHDAY</span>
                  </label>
                  <input type="date" value={formBirthday} onChange={e => setFormBirthday(e.target.value)} />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>
                    <span className="lbl-ja">所属</span>
                    <span className="lbl-en">DEPT</span>
                  </label>
                  <input type="text" value={formDept} onChange={e => setFormDept(e.target.value)} placeholder="営業部" />
                </div>
                <div className="field">
                  <label>
                    <span className="lbl-ja">役職</span>
                    <span className="lbl-en">POSITION (任意)</span>
                  </label>
                  <input type="text" value={formPosition} onChange={e => setFormPosition(e.target.value)} placeholder="役職なしの場合は空欄" />
                </div>
              </div>
              <div className="row">
                <div className="field">
                  <label>
                    <span className="lbl-ja">有給付与日数</span>
                    <span className="lbl-en">PAID LEAVE TOTAL</span>
                  </label>
                  <input
                    type="number" min={0} max={40}
                    value={formPaidTotal}
                    onChange={e => setFormPaidTotal(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>
                    <span className="lbl-ja">有給消化日数</span>
                    <span className="lbl-en">PAID LEAVE USED</span>
                  </label>
                  <input
                    type="number" min={0} step={0.5}
                    value={formPaidUsed}
                    onChange={e => setFormPaidUsed(Number(e.target.value))}
                  />
                </div>
              </div>

              {editingId && (
                <>
                  <div className="field">
                    <label>
                      <span className="lbl-ja">在籍状態</span>
                      <span className="lbl-en">STATUS</span>
                    </label>
                    <select value={formStatus} onChange={e => setFormStatus(e.target.value as 'active' | 'inactive')}>
                      <option value="active">在職 / Active</option>
                      <option value="inactive">退職 / Inactive</option>
                    </select>
                  </div>

                  <div style={{
                    background: '#fef5ec', border: '1px solid var(--orange)',
                    borderLeft: '4px solid var(--orange)', padding: 14, borderRadius: 6, marginTop: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <svg className="icon-svg-sm" style={{ color: 'var(--orange)' }}>
                        <use href="#i-power" />
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#9c5400', letterSpacing: '0.04em' }}>
                        パスワードリセット / PASSWORD RESET
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                      パスワードを忘れた従業員のリセットができます。新しい初期パスワードを設定すると、本人は次回ログイン時に再度パスワード変更を求められます。
                    </p>
                    <div className="row">
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>
                          <span className="lbl-ja">新パスワード</span>
                          <span className="lbl-en">NEW PW</span>
                        </label>
                        <input type="text" value={formResetPw} onChange={e => setFormResetPw(e.target.value)} placeholder="例: temp1234" />
                      </div>
                      <div className="field" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ marginBottom: 0, width: '100%' }}
                          onClick={handleResetPassword}
                        >
                          <svg className="icon-svg-sm"><use href="#i-power" /></svg>
                          リセット実行
                        </button>
                      </div>
                    </div>
                    {resetMsg && (
                      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>{resetMsg}</div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              {editingId && (
                <button className="btn btn-danger" onClick={handleDelete}>
                  <svg className="icon-svg-sm"><use href="#i-trash" /></svg>
                  退職扱い
                </button>
              )}
              <button className="btn" onClick={() => setShowModal(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={submitting}>
                {submitting ? '保存中...' : '保存'}
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

function generateInitialPassword(): string {
  // 数字+英字混在で6文字
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="empty-state">読み込み中...</div>}>
      <EmployeesPageInner />
    </Suspense>
  )
}
