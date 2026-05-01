'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetSession, apiGetEmployee, apiGetAttendance, apiGetCorrections, apiGetLeaves, apiUpdateEmployee, apiChangePassword } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { calcDay } from '@/lib/attendance'
import { formatMinutes } from '@/lib/format'
import type { Employee, AttendanceEvent } from '@/types/db'
import { ChevronDown } from 'lucide-react'

export default function ProfilePage() {
  const [emp, setEmp] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [empId, setEmpId] = useState('')

  // 統計
  const [monthWorked, setMonthWorked] = useState(0)
  const [monthOvertime, setMonthOvertime] = useState(0)
  const [paidLeaveRemaining, setPaidLeaveRemaining] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  // 折り畳み状態（全閉じ）
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({
    info: false,
    edit: false,
    password: false,
  })

  // 編集フォーム
  const [editName, setEditName] = useState('')
  const [editKana, setEditKana] = useState('')
  const [editBirthday, setEditBirthday] = useState('')

  // PW変更
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')

  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const showToast = (msg: string, type: string) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const toggleCard = (id: string) => {
    setOpenCards(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const fetchData = useCallback(async () => {
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

    // 従業員情報
    if (IS_DEMO) {
      const res = await apiGetEmployee(currentEmpId)
      const data = await res.json()
      if (data.data) {
        const e = data.data as Employee
        setEmp(e)
        setEditName(e.name)
        setEditKana(e.kana || '')
        setEditBirthday(e.birthday || '')
        setPaidLeaveRemaining(e.paid_leave_total - e.paid_leave_used)
      }
    } else {
      const supabase = createClient()
      const { data: empData } = await supabase
        .from('employees')
        .select('*')
        .eq('id', currentEmpId)
        .single()
      if (empData) {
        const e = empData as Employee
        setEmp(e)
        setEditName(e.name)
        setEditKana(e.kana || '')
        setEditBirthday(e.birthday || '')
        setPaidLeaveRemaining(e.paid_leave_total - e.paid_leave_used)
      }
    }

    // 今月の勤怠
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`

    let worked = 0
    let overtime = 0
    const standardMin = 8 * 60

    if (IS_DEMO) {
      const res = await apiGetAttendance(currentEmpId, monthStart, monthEnd)
      const data = await res.json()
      data.data?.forEach((r: { events: AttendanceEvent[] }) => {
        const calc = calcDay(r.events)
        if (calc.totalWorked > 0) {
          worked += calc.totalWorked
          if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
        }
      })
    } else {
      const supabase = createClient()
      const { data: monthData } = await supabase
        .from('attendance')
        .select('events')
        .eq('emp_id', currentEmpId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
      monthData?.forEach(r => {
        const calc = calcDay(r.events as AttendanceEvent[])
        if (calc.totalWorked > 0) {
          worked += calc.totalWorked
          if (calc.totalWorked > standardMin) overtime += (calc.totalWorked - standardMin)
        }
      })
    }
    setMonthWorked(worked)
    setMonthOvertime(overtime)

    // 承認待ち件数
    if (IS_DEMO) {
      const [corrRes, leaveRes] = await Promise.all([
        apiGetCorrections(currentEmpId, 'pending'),
        apiGetLeaves(currentEmpId, 'pending'),
      ])
      const corrData = await corrRes.json()
      const leaveData = await leaveRes.json()
      setPendingCount((corrData.data?.length || 0) + (leaveData.data?.length || 0))
    } else {
      const supabase = createClient()
      const { count: corrCount } = await supabase
        .from('correction_requests')
        .select('*', { count: 'exact', head: true })
        .eq('emp_id', currentEmpId)
        .eq('status', 'pending')
      const { count: leaveCount } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('emp_id', currentEmpId)
        .eq('status', 'pending')
      setPendingCount((corrCount || 0) + (leaveCount || 0))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // プロフィール保存
  const handleSaveProfile = async () => {
    if (!emp) return
    setSaving(true)

    if (IS_DEMO) {
      await apiUpdateEmployee(emp.id, {
        name: editName,
        kana: editKana || null,
        birthday: editBirthday || null,
      })
      showToast('プロフィールを更新しました', 'success')
      setEmp({ ...emp, name: editName, kana: editKana || null, birthday: editBirthday || null })
    } else {
      const supabase = createClient()
      const { error } = await supabase
        .from('employees')
        .update({
          name: editName,
          kana: editKana || null,
          birthday: editBirthday || null,
        })
        .eq('id', emp.id)
      if (error) {
        showToast('保存に失敗しました', 'error')
      } else {
        showToast('プロフィールを更新しました', 'success')
        setEmp({ ...emp, name: editName, kana: editKana || null, birthday: editBirthday || null })
      }
    }
    setSaving(false)
  }

  // パスワード変更
  const handleChangePassword = async () => {
    if (newPw.length < 4) {
      showToast('パスワードは4文字以上で入力してください', 'error')
      return
    }
    if (newPw !== newPwConfirm) {
      showToast('新しいパスワードが一致しません', 'error')
      return
    }
    if (newPw === currentPw) {
      showToast('現在のパスワードと同じパスワードは使用できません', 'error')
      return
    }

    setSaving(true)

    if (IS_DEMO) {
      const res = await apiChangePassword(empId, currentPw, newPw)
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'パスワードの変更に失敗しました', 'error')
        setSaving(false)
        return
      }
      showToast('パスワードを変更しました', 'success')
    } else {
      const supabase = createClient()
      // 現在のパスワードで再認証
      const email = `${emp!.id}@b-attendance.local`
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPw,
      })
      if (signInError) {
        showToast('現在のパスワードが正しくありません', 'error')
        setSaving(false)
        return
      }
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) {
        showToast('パスワードの変更に失敗しました', 'error')
        setSaving(false)
        return
      }
      await supabase
        .from('employees')
        .update({ pw_changed_at: new Date().toISOString() })
        .eq('id', emp!.id)
      showToast('パスワードを変更しました', 'success')
    }

    setCurrentPw('')
    setNewPw('')
    setNewPwConfirm('')
    setSaving(false)
  }

  if (loading) {
    return <div className="text-center py-20 text-[13px]" style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
  }

  if (!emp) {
    return <div className="text-center py-20 text-[13px]" style={{ color: 'var(--text-muted)' }}>従業員情報が見つかりません</div>
  }

  return (
    <div>
      {/* ページヘッダー */}
      <div className="mb-5 pb-3 border-b-2" style={{ borderColor: 'var(--primary)' }}>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[20px] font-bold">マイページ</h1>
          <span className="text-[10px] font-mono tracking-[0.16em]" style={{ color: 'var(--text-faint)' }}>PROFILE</span>
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: '今月実働', value: formatMinutes(monthWorked), en: 'WORKED' },
          { label: '今月残業', value: formatMinutes(monthOvertime), en: 'OVERTIME' },
          { label: '有給残', value: `${paidLeaveRemaining}日`, en: 'PAID LEAVE' },
          { label: '承認待ち', value: `${pendingCount}件`, en: 'PENDING' },
        ].map(card => (
          <div key={card.en} className="bg-card border border-border rounded-xl p-4" style={{ boxShadow: 'var(--shadow-xs)' }}>
            <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>{card.en}</div>
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-soft)' }}>{card.label}</div>
            <div className="text-[20px] font-mono font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      {/* 折り畳みカード: 基本情報 */}
      <CollapsibleCard
        title="基本情報"
        titleEn="BASIC INFO"
        isOpen={openCards.info}
        onToggle={() => toggleCard('info')}
      >
        <InfoRow label="社員ID" value={emp.id} />
        <InfoRow label="氏名" value={emp.name} />
        <InfoRow label="よみかな" value={emp.kana || '未設定'} />
        <InfoRow label="生年月日" value={emp.birthday ? formatBirthday(emp.birthday) : '未設定'} />
        <InfoRow label="所属" value={emp.dept || '未設定'} />
        <InfoRow label="役職" value={emp.position || '未設定'} />
        <InfoRow label="登録日" value={emp.created_at ? new Date(emp.created_at).toLocaleDateString('ja-JP') : '-'} />
        <InfoRow label="最終PW変更" value={emp.pw_changed_at ? new Date(emp.pw_changed_at).toLocaleDateString('ja-JP') : '未変更'} />
      </CollapsibleCard>

      {/* 折り畳みカード: 氏名・よみかな・生年月日変更 */}
      <CollapsibleCard
        title="氏名・よみかな・生年月日の変更"
        titleEn="EDIT PROFILE"
        isOpen={openCards.edit}
        onToggle={() => toggleCard('edit')}
      >
        <EditRow label="氏名" value={editName} onChange={setEditName} type="text" />
        <EditRow label="よみかな" value={editKana} onChange={setEditKana} type="text" placeholder="やまだ たろう" />
        <EditRow label="生年月日" value={editBirthday} onChange={setEditBirthday} type="date" />
        <div className="flex justify-end mt-4">
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--primary)' }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </CollapsibleCard>

      {/* 折り畳みカード: パスワード変更 */}
      <CollapsibleCard
        title="パスワード変更"
        titleEn="CHANGE PASSWORD"
        isOpen={openCards.password}
        onToggle={() => toggleCard('password')}
      >
        <EditRow label="現在のパスワード" value={currentPw} onChange={setCurrentPw} type="password" />
        <EditRow label="新しいパスワード" value={newPw} onChange={setNewPw} type="password" placeholder="4文字以上" />
        <EditRow label="新しいパスワード（確認）" value={newPwConfirm} onChange={setNewPwConfirm} type="password" />
        <div className="flex justify-end mt-4">
          <button
            onClick={handleChangePassword}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-[13px] font-bold text-white border-none cursor-pointer"
            style={{ background: 'var(--primary)' }}
          >
            {saving ? '変更中...' : 'パスワードを変更'}
          </button>
        </div>
      </CollapsibleCard>

      {/* トースト */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-5 py-3 rounded-xl text-[13px] font-semibold z-50"
          style={{
            background: toast.type === 'success' ? 'var(--green)' : 'var(--red)',
            color: 'white',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// 折り畳みカードコンポーネント
function CollapsibleCard({
  title, titleEn, isOpen, onToggle, children,
}: {
  title: string; titleEn: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="bg-card border border-border rounded-xl mb-4 overflow-hidden" style={{ boxShadow: 'var(--shadow-xs)' }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer border-none bg-transparent text-left font-mincho"
        style={{ borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}
      >
        <div>
          <span className="text-[14px] font-bold">{title}</span>
          <span className="text-[10px] font-mono tracking-wider ml-2" style={{ color: 'var(--text-faint)' }}>{titleEn}</span>
        </div>
        <ChevronDown
          size={16}
          className="transition-transform"
          style={{
            color: 'var(--text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>
      {isOpen && <div className="px-5 py-4">{children}</div>}
    </div>
  )
}

// 情報行（閲覧専用）
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid py-2 border-b border-border last:border-b-0" style={{ gridTemplateColumns: '180px 1fr' }}>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--text-soft)' }}>{label}</span>
      <span className="text-[13px]">{value}</span>
    </div>
  )
}

// 編集行
function EditRow({
  label, value, onChange, type, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type: string; placeholder?: string
}) {
  return (
    <div className="grid py-2 items-center border-b border-border last:border-b-0" style={{ gridTemplateColumns: '180px 1fr' }}>
      <span className="text-[13px] font-semibold" style={{ color: 'var(--text-soft)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2 border rounded-lg text-[13px] font-mincho focus:outline-none"
        style={{ borderColor: 'var(--border-strong)', background: 'var(--card)', color: 'var(--text)' }}
      />
    </div>
  )
}

function formatBirthday(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00+09:00')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
