'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetSession, apiGetEmployee, apiGetAttendance, apiGetCorrections, apiUpdateEmployee, apiChangePassword, userSelect } from '@/lib/api'
import { calcDay } from '@/lib/attendance'
import { formatMinutes, dowJa } from '@/lib/format'
import { useCachedState, hasCached } from '@/lib/cache'
import type { Employee, AttendanceEvent, Settings } from '@/types/db'

const CK = 'user-profile:'

type CardKey = 'info' | 'edit' | 'pw'

function formatBirthday(isoDate: string | null): string {
  if (!isoDate) return '-'
  const d = new Date(isoDate + 'T00:00:00+09:00')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

function formatJaDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export default function ProfilePage() {
  const [emp, setEmp] = useCachedState<Employee | null>(CK + 'emp', null)
  const [empId, setEmpId] = useCachedState<string>(CK + 'empId', '')
  const [loading, setLoading] = useState<boolean>(() => !hasCached(CK + 'emp'))

  const [openCards, setOpenCards] = useState<Record<CardKey, boolean>>({
    info: false, edit: false, pw: false,
  })

  const [editName, setEditName] = useState('')
  const [editKana, setEditKana] = useState('')
  const [editBirthday, setEditBirthday] = useState('')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw1, setNewPw1] = useState('')
  const [newPw2, setNewPw2] = useState('')
  const [pwError, setPwError] = useState('')

  const [stats, setStats] = useCachedState(CK + 'stats', {
    monthWorked: 0, monthOvertime: 0, pendingCount: 0,
    monthLimit: 45, monthWarn: 36,
  })

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [saving, setSaving] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' | 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const toggleCard = (key: CardKey) => {
    setOpenCards(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const fetchData = useCallback(async () => {
    if (!hasCached(CK + 'emp')) setLoading(true)
    let currentEmpId = ''

    if (IS_DEMO) {
      const sessRes = await apiGetSession()
      const sessData = await sessRes.json()
      if (!sessData.session || sessData.session.type !== 'user') return
      currentEmpId = sessData.session.empId
    } else {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      const meData = await meRes.json()
      if (!meData.session) return
      currentEmpId = meData.session.empId
    }
    setEmpId(currentEmpId)

    let employee: Employee | null = null
    let monthLimit = 45, monthWarn = 36
    let pendingCorrections = 0

    if (IS_DEMO) {
      const empRes = await apiGetEmployee(currentEmpId)
      const empJson = await empRes.json()
      employee = empJson.data as Employee | null

      const corrRes = await apiGetCorrections(currentEmpId, 'pending')
      const corrJson = await corrRes.json()
      pendingCorrections = corrJson.data?.length || 0
    } else {
      const { data: empData } = await userSelect<Employee>({
        table: 'employees', single: true,
      })
      employee = empData

      const { data: settings } = await userSelect<Pick<Settings, 'monthly_overtime_limit' | 'monthly_overtime_warning'>>({
        table: 'settings',
        columns: 'monthly_overtime_limit, monthly_overtime_warning',
        filters: { id: 1 },
        single: true,
      })
      if (settings) {
        monthLimit = settings.monthly_overtime_limit ?? 45
        monthWarn = settings.monthly_overtime_warning ?? 36
      }

      const { data: pendingCorrs } = await userSelect<{ id: string }[]>({
        table: 'correction_requests',
        columns: 'id',
        filters: { status: 'pending' },
      })
      pendingCorrections = pendingCorrs?.length || 0
    }

    if (employee) {
      setEmp(employee)
      setEditName(employee.name)
      setEditKana(employee.kana || '')
      setEditBirthday(employee.birthday || '')
    }

    // 今月の勤怠（実働 / 残業）
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`

    let worked = 0, overtime = 0
    const standardMin = 8 * 60

    if (IS_DEMO) {
      const res = await apiGetAttendance(currentEmpId, monthStart, monthEnd)
      const data = await res.json()
      ;(data.data || []).forEach((r: { events: AttendanceEvent[] }) => {
        const calc = calcDay(r.events)
        worked += calc.totalWorked
        if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
      })
    } else {
      const { data } = await userSelect<{ events: AttendanceEvent[] }[]>({
        table: 'attendance',
        columns: 'events',
        gte: { column: 'date', value: monthStart },
        lte: { column: 'date', value: monthEnd },
      })
      ;(data || []).forEach(r => {
        const calc = calcDay(r.events)
        worked += calc.totalWorked
        if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
      })
    }

    setStats({
      monthWorked: worked,
      monthOvertime: overtime,
      pendingCount: pendingCorrections,
      monthLimit, monthWarn,
    })

    setLoading(false)
  }, [setEmp, setEmpId, setStats])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaveProfile = async () => {
    if (!emp) return
    setSaving(true)
    const updates = {
      name: editName,
      kana: editKana || null,
      birthday: editBirthday || null,
    }
    if (IS_DEMO) {
      await apiUpdateEmployee(emp.id, updates)
      showToast('プロフィールを更新しました', 'success')
      setEmp({ ...emp, ...updates })
    } else {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const data = await res.json()
      if (!res.ok) showToast('保存に失敗しました: ' + (data.error || '不明'), 'error')
      else {
        showToast('プロフィールを更新しました', 'success')
        setEmp({ ...emp, ...updates })
      }
    }
    setSaving(false)
  }

  const handleResetProfile = () => {
    if (!emp) return
    setEditName(emp.name)
    setEditKana(emp.kana || '')
    setEditBirthday(emp.birthday || '')
  }

  const handleChangePassword = async () => {
    setPwError('')
    if (newPw1.length < 4) { setPwError('パスワードは4文字以上で設定してください。'); return }
    if (newPw1 !== newPw2) { setPwError('新しいパスワードが一致しません。'); return }
    if (newPw1 === currentPw) { setPwError('現在のパスワードと異なるものを設定してください。'); return }

    setSaving(true)
    if (IS_DEMO) {
      const res = await apiChangePassword(empId, currentPw, newPw1)
      const data = await res.json()
      if (!res.ok) {
        setPwError(data.error || 'パスワードの変更に失敗しました')
        setSaving(false)
        return
      }
      showToast('パスワードを変更しました', 'success')
    } else {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw1 }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPwError(data.error || 'パスワードの変更に失敗しました。')
        setSaving(false)
        return
      }
      showToast('パスワードを変更しました', 'success')
    }
    setCurrentPw('')
    setNewPw1('')
    setNewPw2('')
    setSaving(false)
  }

  if (loading) {
    return <div className="empty-state">読み込み中...</div>
  }
  if (!emp) {
    return <div className="empty-state">従業員情報が見つかりません</div>
  }

  // 今月残業のステータス色
  const otHours = stats.monthOvertime / 60
  const otStatusColor =
    otHours >= stats.monthLimit ? 'color-red' :
    otHours >= stats.monthWarn ? 'color-yellow' : 'color-green'

  const today = new Date()
  const greetingMeta = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 (${dowJa(today)})`

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">マイページ</span>
          <span className="page-title-en">MY PROFILE</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">{emp.name}</span>さん、お疲れ様です。
          </div>
          <div className="greeting-meta">
            <span>{greetingMeta}</span>
            <span className="greeting-meta-en"> / {emp.id}</span>
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card color-blue">
          <div className="stat-icon-box"><svg><use href="#i-stopwatch" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">今月実働</span>
              <span className="stat-label-en">WORKED</span>
            </div>
            <div className="stat-value">{formatMinutes(stats.monthWorked)}<span className="stat-unit">時間</span></div>
          </div>
        </div>
        <div className={`stat-card ${otStatusColor}`}>
          <div className="stat-icon-box"><svg><use href="#i-warning" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">今月残業</span>
              <span className="stat-label-en">OVERTIME</span>
            </div>
            <div className="stat-value">{otHours.toFixed(1)}<span className="stat-unit">h</span></div>
          </div>
        </div>
        <div className="stat-card color-orange">
          <div className="stat-icon-box"><svg><use href="#i-inbox" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">承認待ち</span>
              <span className="stat-label-en">PENDING</span>
            </div>
            <div className="stat-value">{stats.pendingCount}<span className="stat-unit">件</span></div>
          </div>
        </div>
      </div>

      {/* 基本情報（折り畳み・閲覧のみ） */}
      <div className={`card collapsible${openCards.info ? '' : ' collapsed'}`}>
        <div className="card-header" onClick={() => toggleCard('info')}>
          <div className="card-title-block">
            <span className="card-title">基本情報</span>
            <span className="card-title-en">PROFILE</span>
          </div>
          <svg className="card-toggle-icon"><use href="#i-chev-down" /></svg>
        </div>
        <div className="card-body" style={{ padding: '6px 18px 18px' }}>
          <ProfileInfoRow ja="社員ID" en="EMPLOYEE ID" value={emp.id} />
          <ProfileInfoRow ja="氏名" en="NAME" value={emp.name} />
          <ProfileInfoRow ja="よみかな" en="KANA" value={emp.kana || '-'} />
          <ProfileInfoRow ja="生年月日" en="BIRTHDAY" value={formatBirthday(emp.birthday)} />
          <ProfileInfoRow ja="所属" en="DEPT" value={emp.dept || '-'} />
          <ProfileInfoRow ja="役職" en="POSITION" value={emp.position || '-'} />
          <ProfileInfoRow ja="登録日" en="JOINED" value={formatJaDate(emp.created_at)} />
          <ProfileInfoRow ja="最終パスワード変更" en="PW UPDATED" value={emp.pw_changed_at ? formatJaDate(emp.pw_changed_at) : '未変更'} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            ※ 所属・役職・社員IDの変更は管理者にご相談ください
          </p>
        </div>
      </div>

      {/* 個人情報変更 */}
      <div className={`card collapsible${openCards.edit ? '' : ' collapsed'}`}>
        <div className="card-header" onClick={() => toggleCard('edit')}>
          <div className="card-title-block">
            <span className="card-title">氏名・よみかな・生年月日の変更</span>
            <span className="card-title-en">EDIT PROFILE</span>
          </div>
          <svg className="card-toggle-icon"><use href="#i-chev-down" /></svg>
        </div>
        <div className="card-body" style={{ padding: '6px 18px 18px' }}>
          <div className="profile-row">
            <div className="profile-row-label">
              <span className="lbl-ja">氏名</span><span className="lbl-en">NAME</span>
            </div>
            <div className="profile-row-value">
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="例 山田 太郎" />
            </div>
          </div>
          <div className="profile-row">
            <div className="profile-row-label">
              <span className="lbl-ja">よみかな</span><span className="lbl-en">KANA</span>
            </div>
            <div className="profile-row-value">
              <input type="text" value={editKana} onChange={e => setEditKana(e.target.value)} placeholder="例 やまだ たろう" />
            </div>
          </div>
          <div className="profile-row">
            <div className="profile-row-label">
              <span className="lbl-ja">生年月日</span><span className="lbl-en">BIRTHDAY</span>
            </div>
            <div className="profile-row-value">
              <input type="date" value={editBirthday} onChange={e => setEditBirthday(e.target.value)} />
            </div>
          </div>
          <div className="profile-row-actions">
            <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
              <svg className="icon-svg-sm"><use href="#i-check" /></svg>
              {saving ? '保存中...' : '変更を保存'}
            </button>
            <button className="btn" onClick={handleResetProfile}>破棄 / Reset</button>
          </div>
        </div>
      </div>

      {/* パスワード変更 */}
      <div className={`card collapsible${openCards.pw ? '' : ' collapsed'}`}>
        <div className="card-header" onClick={() => toggleCard('pw')}>
          <div className="card-title-block">
            <span className="card-title">パスワード変更</span>
            <span className="card-title-en">CHANGE PASSWORD</span>
          </div>
          <svg className="card-toggle-icon"><use href="#i-chev-down" /></svg>
        </div>
        <div className="card-body" style={{ padding: '6px 18px 18px' }}>
          {pwError && <div className="error-msg" style={{ marginBottom: 12 }}>{pwError}</div>}
          <div className="profile-row">
            <div className="profile-row-label">
              <span className="lbl-ja">現在のパスワード</span><span className="lbl-en">CURRENT</span>
            </div>
            <div className="profile-row-value">
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <div className="profile-row">
            <div className="profile-row-label">
              <span className="lbl-ja">新しいパスワード</span><span className="lbl-en">NEW</span>
            </div>
            <div className="profile-row-value">
              <input type="password" value={newPw1} onChange={e => setNewPw1(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <div className="profile-row">
            <div className="profile-row-label">
              <span className="lbl-ja">新しいパスワード（確認）</span><span className="lbl-en">CONFIRM</span>
            </div>
            <div className="profile-row-value">
              <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.7 }}>
            ・4文字以上で設定してください<br />
            ・現在のパスワードと異なるものを設定してください
          </p>
          <div className="profile-row-actions">
            <button className="btn btn-primary" onClick={handleChangePassword} disabled={saving}>
              <svg className="icon-svg-sm"><use href="#i-power" /></svg>
              {saving ? '変更中...' : 'パスワードを変更'}
            </button>
          </div>
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

function ProfileInfoRow({ ja, en, value }: { ja: string; en: string; value: string }) {
  return (
    <div className="profile-row">
      <div className="profile-row-label">
        <span className="lbl-ja">{ja}</span>
        <span className="lbl-en">{en}</span>
      </div>
      <div className="profile-row-value">
        <span className="readonly-text">{value}</span>
      </div>
    </div>
  )
}
