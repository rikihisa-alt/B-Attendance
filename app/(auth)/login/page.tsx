'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Tab = 'user' | 'admin'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('user')
  const [clock, setClock] = useState('')

  // ユーザーフォーム
  const [empId, setEmpId] = useState('')
  const [empPw, setEmpPw] = useState('')
  const [userError, setUserError] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  // 管理者フォーム
  const [adminPw, setAdminPw] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  // 初回ログインモーダル
  const [showFirstLogin, setShowFirstLogin] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [firstLoginError, setFirstLoginError] = useState('')
  const [firstLoginLoading, setFirstLoginLoading] = useState(false)
  const [currentEmpId, setCurrentEmpId] = useState('')

  // リアルタイム時計
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ユーザーログイン
  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError('')
    setUserLoading(true)

    try {
      const supabase = createClient()
      const email = `${empId.toUpperCase()}@b-attendance.local`

      const { error } = await supabase.auth.signInWithPassword({ email, password: empPw })
      if (error) {
        setUserError('社員IDまたはパスワードが正しくありません')
        setUserLoading(false)
        return
      }

      // first_login チェック
      const { data: emp } = await supabase
        .from('employees')
        .select('first_login')
        .eq('id', empId.toUpperCase())
        .single()

      if (emp?.first_login) {
        setCurrentEmpId(empId.toUpperCase())
        setShowFirstLogin(true)
        setUserLoading(false)
        return
      }

      router.push('/home')
    } catch {
      setUserError('ログインに失敗しました')
      setUserLoading(false)
    }
  }

  // 初回パスワード変更
  const handleFirstLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFirstLoginError('')

    if (newPw.length < 4) {
      setFirstLoginError('パスワードは4文字以上で入力してください')
      return
    }
    if (newPw !== newPwConfirm) {
      setFirstLoginError('パスワードが一致しません')
      return
    }
    if (newPw === empPw) {
      setFirstLoginError('初期パスワードと同じパスワードは使用できません')
      return
    }

    setFirstLoginLoading(true)

    try {
      const supabase = createClient()

      // Supabase Auth のパスワード更新
      const { error: authError } = await supabase.auth.updateUser({ password: newPw })
      if (authError) {
        setFirstLoginError('パスワードの変更に失敗しました')
        setFirstLoginLoading(false)
        return
      }

      // employees テーブルの first_login と pw_changed_at を更新
      await supabase
        .from('employees')
        .update({
          first_login: false,
          pw_changed_at: new Date().toISOString(),
        })
        .eq('id', currentEmpId)

      setShowFirstLogin(false)
      router.push('/home')
    } catch {
      setFirstLoginError('処理に失敗しました')
      setFirstLoginLoading(false)
    }
  }

  // 管理者ログイン
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setAdminLoading(true)

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPw }),
      })

      const data = await res.json()
      if (!res.ok) {
        setAdminError(data.error || '認証に失敗しました')
        setAdminLoading(false)
        return
      }

      router.push('/admin/dashboard')
    } catch {
      setAdminError('認証処理でエラーが発生しました')
      setAdminLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* 背景のグラデーション */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(31, 109, 201, 0.05) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(56, 161, 105, 0.04) 0%, transparent 45%)',
        }}
      />

      <div className="w-full max-w-[520px] bg-card border border-border rounded-2xl overflow-hidden relative z-10" style={{ boxShadow: 'var(--shadow-lg)' }}>
        {/* ヘッダーバー */}
        <div className="flex items-center justify-between px-8 py-2 border-b border-border bg-card">
          <div className="flex items-center gap-4">
            <div className="flex flex-col gap-0">
              <span className="text-[19px] font-bold tracking-wide">B-Attendance</span>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mincho text-[16px] font-semibold" style={{ color: 'var(--text-soft)' }}>勤怠管理システム</span>
                <span style={{ color: 'var(--text-faint)', fontSize: '14px' }}>|</span>
                <span className="font-mono text-[11px] font-semibold tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>ATTENDANCE</span>
              </div>
            </div>
          </div>
          <div
            className="font-mono text-[13px] tracking-wide px-3.5 py-1.5 rounded-md"
            style={{ color: 'var(--primary)', background: 'var(--primary-pale)', letterSpacing: '0.06em' }}
          >
            {clock}
          </div>
        </div>

        {/* 説明エリア */}
        <div className="px-[30px] py-9" style={{ background: 'var(--primary-bg)', borderBottom: '1px solid var(--border)' }}>
          <span className="font-mono text-[10px] font-semibold tracking-[0.18em] block mb-3.5" style={{ color: 'var(--primary)' }}>
            SECURE LOGIN
          </span>
          <h2 className="text-[26px] font-semibold mb-3 leading-snug tracking-wide">
            <span style={{ color: 'var(--primary)' }}>安全</span>な勤怠管理を
          </h2>
          <p className="text-[13px] leading-[1.85] mb-6" style={{ color: 'var(--text-soft)' }}>
            社員IDとパスワードでログインしてください。管理者はADMINタブからログインしてください。
          </p>
          <ul className="list-none p-0">
            {[
              ['出退勤の正確な記録', 'リアルタイム打刻で正確な勤怠管理'],
              ['36協定コンプライアンス', '残業時間の自動集計と超過警告'],
              ['セキュアなデータ管理', '暗号化通信と5年保存対応'],
            ].map(([title, desc]) => (
              <li key={title} className="flex items-center gap-2.5 py-2.5 text-[13px] border-b border-border last:border-b-0" style={{ color: 'var(--text-soft)' }}>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--green)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong>{title}</strong> — {desc}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* タブ */}
        <div className="grid grid-cols-2 border-b border-border">
          {(['user', 'admin'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-4 px-3.5 border-none font-mincho text-[13px] font-semibold cursor-pointer relative transition-all ${
                t === 'user' ? 'border-r border-border' : ''
              } ${
                tab === t
                  ? 'bg-card'
                  : 'bg-bg-soft'
              }`}
              style={{
                color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
                borderRight: t === 'user' ? '1px solid var(--border)' : undefined,
              }}
            >
              <span className="font-mono text-[9px] tracking-[0.2em] font-bold block mb-0.5" style={{ color: tab === t ? 'var(--primary)' : 'var(--text-faint)' }}>
                {t.toUpperCase()}
              </span>
              <span className="font-mincho">{t === 'user' ? '従業員ログイン' : '管理者ログイン'}</span>
              {tab === t && (
                <span className="absolute left-[24%] right-[24%] -bottom-px h-0.5" style={{ background: 'var(--primary)' }} />
              )}
            </button>
          ))}
        </div>

        {/* ログインフォーム */}
        <div className="px-8 pt-[30px] pb-[26px]">
          {tab === 'user' ? (
            <form onSubmit={handleUserLogin}>
              {userError && (
                <div className="mb-4 px-3.5 py-2.5 text-[12px] rounded-md" style={{
                  background: 'var(--red-bg)', border: '1px solid #fbb6b6', borderLeft: '3px solid var(--red)', color: 'var(--red)'
                }}>
                  {userError}
                </div>
              )}
              <div className="mb-4">
                <label className="flex justify-between items-baseline text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-soft)' }}>
                  <span className="font-mincho font-semibold">社員ID</span>
                  <span className="font-mono text-[10px] tracking-wide" style={{ color: 'var(--text-faint)' }}>EMPLOYEE ID</span>
                </label>
                <input
                  type="text"
                  value={empId}
                  onChange={e => setEmpId(e.target.value)}
                  placeholder="EMP001"
                  className="w-full px-3.5 py-[11px] border rounded-lg font-mincho text-sm transition-all focus:outline-none"
                  style={{
                    borderColor: 'var(--border-strong)', background: 'var(--card)', color: 'var(--text)',
                  }}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="flex justify-between items-baseline text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-soft)' }}>
                  <span className="font-mincho font-semibold">パスワード</span>
                  <span className="font-mono text-[10px] tracking-wide" style={{ color: 'var(--text-faint)' }}>PASSWORD</span>
                </label>
                <input
                  type="password"
                  value={empPw}
                  onChange={e => setEmpPw(e.target.value)}
                  placeholder="パスワードを入力"
                  className="w-full px-3.5 py-[11px] border rounded-lg font-mincho text-sm transition-all focus:outline-none"
                  style={{
                    borderColor: 'var(--border-strong)', background: 'var(--card)', color: 'var(--text)',
                  }}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={userLoading}
                className="w-full py-3 px-4 text-sm font-bold rounded-lg transition-all text-white cursor-pointer border-none"
                style={{ background: userLoading ? 'var(--primary-light)' : 'var(--primary)' }}
              >
                {userLoading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin}>
              {adminError && (
                <div className="mb-4 px-3.5 py-2.5 text-[12px] rounded-md" style={{
                  background: 'var(--red-bg)', border: '1px solid #fbb6b6', borderLeft: '3px solid var(--red)', color: 'var(--red)'
                }}>
                  {adminError}
                </div>
              )}
              <div className="mb-4">
                <label className="flex justify-between items-baseline text-[12px] font-medium mb-1.5" style={{ color: 'var(--text-soft)' }}>
                  <span className="font-mincho font-semibold">管理者パスワード</span>
                  <span className="font-mono text-[10px] tracking-wide" style={{ color: 'var(--text-faint)' }}>ADMIN PASSWORD</span>
                </label>
                <input
                  type="password"
                  value={adminPw}
                  onChange={e => setAdminPw(e.target.value)}
                  placeholder="管理者パスワードを入力"
                  className="w-full px-3.5 py-[11px] border rounded-lg font-mincho text-sm transition-all focus:outline-none"
                  style={{
                    borderColor: 'var(--border-strong)', background: 'var(--card)', color: 'var(--text)',
                  }}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={adminLoading}
                className="w-full py-3 px-4 text-sm font-bold rounded-lg transition-all text-white cursor-pointer border-none"
                style={{ background: adminLoading ? 'var(--primary-light)' : 'var(--primary)' }}
              >
                {adminLoading ? 'ログイン中...' : '管理者ログイン'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 初回ログインモーダル */}
      {showFirstLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md bg-card rounded-2xl p-8" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <h3 className="text-lg font-bold mb-2">初回パスワード変更</h3>
            <p className="text-[13px] mb-6" style={{ color: 'var(--text-soft)' }}>
              セキュリティのため、初回ログイン時にパスワードの変更が必要です。
            </p>

            <form onSubmit={handleFirstLoginSubmit}>
              {firstLoginError && (
                <div className="mb-4 px-3.5 py-2.5 text-[12px] rounded-md" style={{
                  background: 'var(--red-bg)', border: '1px solid #fbb6b6', borderLeft: '3px solid var(--red)', color: 'var(--red)'
                }}>
                  {firstLoginError}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-soft)' }}>新しいパスワード</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="4文字以上"
                  className="w-full px-3.5 py-[11px] border rounded-lg font-mincho text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border-strong)', background: 'var(--card)', color: 'var(--text)' }}
                  required
                  minLength={4}
                />
              </div>
              <div className="mb-6">
                <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-soft)' }}>新しいパスワード（確認）</label>
                <input
                  type="password"
                  value={newPwConfirm}
                  onChange={e => setNewPwConfirm(e.target.value)}
                  placeholder="もう一度入力"
                  className="w-full px-3.5 py-[11px] border rounded-lg font-mincho text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border-strong)', background: 'var(--card)', color: 'var(--text)' }}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={firstLoginLoading}
                className="w-full py-3 px-4 text-sm font-bold rounded-lg transition-all text-white cursor-pointer border-none"
                style={{ background: firstLoginLoading ? 'var(--primary-light)' : 'var(--primary)' }}
              >
                {firstLoginLoading ? '変更中...' : 'パスワードを変更してログイン'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
