'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetSettings, apiUpdateSettings } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import type { Settings } from '@/types/db'

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  const [companyName, setCompanyName] = useState('')
  const [workHours, setWorkHours] = useState(8)
  const [workDays, setWorkDays] = useState(20)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [monthLimit, setMonthLimit] = useState(45)
  const [yearLimit, setYearLimit] = useState(360)
  const [monthWarn, setMonthWarn] = useState(36)
  const [saving, setSaving] = useState(false)

  const [adminIdInput, setAdminIdInput] = useState('')
  const [currentPw, setCurrentPw] = useState('')
  const [newPw1, setNewPw1] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwChanging, setPwChanging] = useState(false)

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    let s: Settings | null = null
    if (IS_DEMO) {
      const res = await apiGetSettings()
      const data = await res.json()
      s = data.data as Settings | null
    } else {
      const supabase = createClient()
      const { data } = await supabase.from('settings').select('*').eq('id', 1).single()
      s = data as Settings | null
    }
    if (s) {
      setSettings(s)
      setCompanyName(s.company_name || '')
      setWorkHours(s.standard_work_hours)
      setWorkDays(s.standard_work_days)
      setStartTime(s.work_start_time)
      setEndTime(s.work_end_time)
      setMonthLimit(s.monthly_overtime_limit)
      setYearLimit(s.yearly_overtime_limit)
      setMonthWarn(s.monthly_overtime_warning)
      setAdminIdInput(s.admin_id || '')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSaveSettings = async () => {
    setSaving(true)
    const updates = {
      company_name: companyName,
      standard_work_hours: Number(workHours),
      standard_work_days: Number(workDays),
      work_start_time: startTime,
      work_end_time: endTime,
      monthly_overtime_limit: Number(monthLimit),
      yearly_overtime_limit: Number(yearLimit),
      monthly_overtime_warning: Number(monthWarn),
      admin_id: adminIdInput.trim(),
    }
    if (IS_DEMO) {
      await apiUpdateSettings(updates)
    } else {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || '保存失敗', 'error')
        setSaving(false)
        return
      }
    }
    showToast('設定を保存しました', 'success')
    await load()
    setSaving(false)
  }

  const handleChangePassword = async () => {
    setPwError('')
    if (!currentPw) { setPwError('現在のパスワードを入力してください'); return }
    if (newPw1.length < 4) { setPwError('新しいパスワードは4文字以上で設定してください'); return }
    if (newPw1 !== newPw2) { setPwError('新しいパスワードが一致しません'); return }
    if (newPw1 === currentPw) { setPwError('現在のパスワードと異なるものを設定してください'); return }

    setPwChanging(true)
    if (IS_DEMO) {
      // Demo モードでは平文比較
      showToast('DEMOモードでは管理者パスワードは admin 固定です', 'info')
      setPwChanging(false)
      return
    }
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPw, new_password: newPw1 }),
    })
    const data = await res.json()
    if (!res.ok) {
      setPwError(data.error || '変更失敗')
      setPwChanging(false)
      return
    }
    setCurrentPw(''); setNewPw1(''); setNewPw2('')
    showToast('管理者パスワードを変更しました', 'success')
    setPwChanging(false)
  }

  if (loading) {
    return <div className="empty-state">読み込み中...</div>
  }
  if (!settings) {
    return <div className="empty-state">設定の取得に失敗しました</div>
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">設定</span>
          <span className="page-title-en">SETTINGS</span>
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
            <span className="card-title">会社情報</span>
            <span className="card-title-en">COMPANY</span>
          </div>
        </div>
        <div className="card-body">
          <div className="field">
            <label>
              <span className="lbl-ja">会社名</span>
              <span className="lbl-en">COMPANY NAME</span>
            </label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">所定労働時間</span>
            <span className="card-title-en">STANDARD WORK</span>
          </div>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="field">
              <label>
                <span className="lbl-ja">所定労働時間 (時間/日)</span>
                <span className="lbl-en">HOURS/DAY</span>
              </label>
              <input type="number" min={1} max={24} step={0.5}
                value={workHours} onChange={e => setWorkHours(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>
                <span className="lbl-ja">所定労働日数 (日/月)</span>
                <span className="lbl-en">DAYS/MONTH</span>
              </label>
              <input type="number" min={1} max={31}
                value={workDays} onChange={e => setWorkDays(Number(e.target.value))} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>
                <span className="lbl-ja">標準始業時刻</span>
                <span className="lbl-en">START TIME</span>
              </label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="field">
              <label>
                <span className="lbl-ja">標準終業時刻</span>
                <span className="lbl-en">END TIME</span>
              </label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">36協定 / 残業上限</span>
            <span className="card-title-en">36 AGREEMENT</span>
          </div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.7 }}>
            労使協定上の時間外労働上限を設定します。法定上限：月45時間 / 年360時間
          </p>
          <div className="row">
            <div className="field">
              <label>
                <span className="lbl-ja">月間上限 (時間)</span>
                <span className="lbl-en">MONTHLY LIMIT</span>
              </label>
              <input type="number" min={1} max={100}
                value={monthLimit} onChange={e => setMonthLimit(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>
                <span className="lbl-ja">年間上限 (時間)</span>
                <span className="lbl-en">YEARLY LIMIT</span>
              </label>
              <input type="number" min={1} max={999}
                value={yearLimit} onChange={e => setYearLimit(Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label>
              <span className="lbl-ja">警告ライン (時間/月)</span>
              <span className="lbl-en">WARNING LEVEL</span>
            </label>
            <input type="number" min={1} max={100}
              value={monthWarn} onChange={e => setMonthWarn(Number(e.target.value))} />
          </div>
        </div>
      </div>

      <div className="gap-8" style={{ marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
          {saving ? '保存中...' : '設定を保存 / Save Settings'}
        </button>
        <button className="btn" onClick={load}>破棄 / Discard</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">管理者ログイン情報</span>
            <span className="card-title-en">ADMIN CREDENTIALS</span>
          </div>
        </div>
        <div className="card-body">
          <div className="field">
            <label>
              <span className="lbl-ja">管理者ID</span>
              <span className="lbl-en">ADMIN ID</span>
            </label>
            <input type="text" value={adminIdInput} onChange={e => setAdminIdInput(e.target.value)} placeholder="例 admin" />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 12 }}>
            ※ 管理者IDは「設定を保存」ボタンで反映されます。パスワードの変更は下のフォームで行ってください。
          </p>

          {pwError && <div className="error-msg">{pwError}</div>}
          <div className="row">
            <div className="field">
              <label>
                <span className="lbl-ja">現在のパスワード *</span>
                <span className="lbl-en">CURRENT</span>
              </label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="field"></div>
          </div>
          <div className="row">
            <div className="field">
              <label>
                <span className="lbl-ja">新しいパスワード *</span>
                <span className="lbl-en">NEW</span>
              </label>
              <input type="password" value={newPw1} onChange={e => setNewPw1(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <label>
                <span className="lbl-ja">新しいパスワード（確認）*</span>
                <span className="lbl-en">CONFIRM</span>
              </label>
              <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            ※ 4文字以上で設定してください。忘れると復旧できないので注意。
          </p>
          <button className="btn btn-primary" onClick={handleChangePassword} disabled={pwChanging}>
            <svg className="icon-svg-sm"><use href="#i-power" /></svg>
            {pwChanging ? '変更中...' : 'パスワードを変更'}
          </button>
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
