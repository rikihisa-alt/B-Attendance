'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { IS_DEMO, apiLoginUser, apiLoginAdmin, apiChangePassword } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

type Tab = 'user' | 'admin'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('admin')
  const [clock, setClock] = useState('--:--:--')

  const [empId, setEmpId] = useState('')
  const [empPw, setEmpPw] = useState('')
  const [userError, setUserError] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  const [adminId, setAdminId] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [adminError, setAdminError] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)

  const [showFirstLogin, setShowFirstLogin] = useState(false)
  const [flPw1, setFlPw1] = useState('')
  const [flPw2, setFlPw2] = useState('')
  const [flError, setFlError] = useState('')
  const [flLoading, setFlLoading] = useState(false)
  const [currentEmpId, setCurrentEmpId] = useState('')
  const [initialPw, setInitialPw] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError('')
    setUserLoading(true)
    try {
      if (IS_DEMO) {
        const res = await apiLoginUser(empId.toUpperCase(), empPw)
        const data = await res.json()
        if (!res.ok) {
          setUserError(data.error || '社員IDまたはパスワードが正しくありません')
          setUserLoading(false)
          return
        }
        if (data.employee?.first_login) {
          setCurrentEmpId(empId.toUpperCase())
          setInitialPw(empPw)
          setShowFirstLogin(true)
          setUserLoading(false)
          return
        }
        router.push('/home')
      } else {
        const supabase = createClient()
        const upperEmpId = empId.trim().toUpperCase()
        // メールはSupabase側で小文字正規化されるが、念のため小文字で送る
        const email = `${upperEmpId.toLowerCase()}@b-attendance.local`
        const { error } = await supabase.auth.signInWithPassword({ email, password: empPw })
        if (error) {
          setUserError(
            error.message.includes('Invalid login credentials')
              ? '社員IDまたはパスワードが正しくありません'
              : 'ログイン失敗: ' + error.message
          )
          setUserLoading(false)
          return
        }
        const { data: emp, error: empError } = await supabase
          .from('employees')
          .select('first_login')
          .eq('id', upperEmpId)
          .maybeSingle()
        if (empError) {
          setUserError('従業員情報の取得に失敗しました: ' + empError.message)
          setUserLoading(false)
          return
        }
        if (!emp) {
          setUserError(
            'Authユーザーは存在しますが、employees テーブルに該当行がありません。' +
            ' 管理者画面で従業員を作り直してください。'
          )
          setUserLoading(false)
          return
        }
        if (emp.first_login) {
          setCurrentEmpId(upperEmpId)
          setInitialPw(empPw)
          setShowFirstLogin(true)
          setUserLoading(false)
          return
        }
        router.push('/home')
      }
    } catch {
      setUserError('ログインに失敗しました')
      setUserLoading(false)
    }
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminError('')
    setAdminLoading(true)
    try {
      const res = await apiLoginAdmin(adminPw, adminId.trim())
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

  const handleFirstLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFlError('')
    if (flPw1.length < 4) { setFlError('4文字以上で設定してください。'); return }
    if (flPw1 !== flPw2) { setFlError('新しいパスワードが一致しません。'); return }
    if (flPw1 === initialPw) { setFlError('初期パスワードと同じものは使用できません。'); return }
    setFlLoading(true)
    try {
      if (IS_DEMO) {
        const res = await apiChangePassword(currentEmpId, initialPw, flPw1)
        const data = await res.json()
        if (!res.ok) {
          setFlError(data.error || 'パスワードの変更に失敗しました')
          setFlLoading(false)
          return
        }
      } else {
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password: flPw1 })
        if (error) {
          setFlError('パスワードの変更に失敗しました')
          setFlLoading(false)
          return
        }
        await supabase
          .from('employees')
          .update({ first_login: false, pw_changed_at: new Date().toISOString() })
          .eq('id', currentEmpId)
      }
      setShowFirstLogin(false)
      router.push('/home')
    } catch {
      setFlError('処理に失敗しました')
      setFlLoading(false)
    }
  }

  return (
    <>
      <div className="login-screen">
        <div className="login-container">
          <div className="login-header-bar">
            <div className="login-header-brand">
              <Image
                className="login-logo-full-img"
                src="/logo-full.png"
                alt="B-Attendance"
                width={400}
                height={80}
                priority
              />
              <div className="login-logo-sub">
                <span className="ja">勤怠管理システム</span>
              </div>
            </div>
            <div className="login-time">{clock}</div>
          </div>

          <div className="login-body">
            <div className="login-panels">
              <div className="login-tabs">
                <button
                  type="button"
                  className={`login-tab ${tab === 'user' ? 'active' : ''}`}
                  onClick={() => setTab('user')}
                >
                  <span className="login-tab-icon">USER</span>
                  <span className="ja">一般ログイン</span>
                </button>
                <button
                  type="button"
                  className={`login-tab ${tab === 'admin' ? 'active' : ''}`}
                  onClick={() => setTab('admin')}
                >
                  <span className="login-tab-icon">ADMIN</span>
                  <span className="ja">管理者ログイン</span>
                </button>
              </div>

              {tab === 'user' ? (
                <form className="login-form" onSubmit={handleUserLogin}>
                  {userError && <div className="error-msg">{userError}</div>}
                  <div className="field">
                    <label>
                      <span className="lbl-ja">社員ID</span>
                      <span className="lbl-en">EMPLOYEE ID</span>
                    </label>
                    <input
                      type="text"
                      value={empId}
                      onChange={e => setEmpId(e.target.value)}
                      placeholder="IDを入力"
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="field">
                    <label>
                      <span className="lbl-ja">パスワード</span>
                      <span className="lbl-en">PASSWORD</span>
                    </label>
                    <input
                      type="password"
                      value={empPw}
                      onChange={e => setEmpPw(e.target.value)}
                      placeholder="パスワードを入力"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block" disabled={userLoading}>
                    {userLoading ? 'ログイン中...' : 'ログイン / Sign in'}
                  </button>
                </form>
              ) : (
                <form className="login-form" onSubmit={handleAdminLogin}>
                  {adminError && <div className="error-msg">{adminError}</div>}
                  <div className="field">
                    <label>
                      <span className="lbl-ja">管理者ID</span>
                      <span className="lbl-en">ADMIN ID</span>
                    </label>
                    <input
                      type="text"
                      value={adminId}
                      onChange={e => setAdminId(e.target.value)}
                      placeholder="IDを入力"
                      autoComplete="off"
                    />
                  </div>
                  <div className="field">
                    <label>
                      <span className="lbl-ja">パスワード</span>
                      <span className="lbl-en">PASSWORD</span>
                    </label>
                    <input
                      type="password"
                      value={adminPw}
                      onChange={e => setAdminPw(e.target.value)}
                      placeholder="パスワードを入力"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-block" disabled={adminLoading}>
                    {adminLoading ? 'ログイン中...' : '管理者ログイン / Admin sign in'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {showFirstLogin && (
        <div className="modal-overlay show">
          <div className="modal">
            <div
              className="modal-header"
              style={{ background: 'var(--orange-bg)', borderLeftColor: 'var(--orange)' }}
            >
              <div className="modal-title" style={{ color: '#9c5400' }}>
                <svg
                  className="icon-svg-sm"
                  style={{ color: 'var(--orange)', verticalAlign: 'middle', marginRight: 6 }}
                >
                  <use href="#i-warning" />
                </svg>
                パスワードを設定してください / Set Your Password
              </div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.7, marginBottom: 14 }}>
                初回ログインです。安全のため、ご自身でパスワードを設定してください。<br />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  First login detected. Please set your own password for security.
                </span>
              </p>
              {flError && <div className="error-msg">{flError}</div>}
              <form onSubmit={handleFirstLoginSubmit}>
                <div className="field">
                  <label>
                    <span className="lbl-ja">新しいパスワード *</span>
                    <span className="lbl-en">NEW PASSWORD</span>
                  </label>
                  <input
                    type="password"
                    value={flPw1}
                    onChange={e => setFlPw1(e.target.value)}
                    placeholder="8文字以上推奨"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div className="field">
                  <label>
                    <span className="lbl-ja">新しいパスワード（確認） *</span>
                    <span className="lbl-en">CONFIRM</span>
                  </label>
                  <input
                    type="password"
                    value={flPw2}
                    onChange={e => setFlPw2(e.target.value)}
                    placeholder="同じパスワードをもう一度入力"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-muted)', padding: '10px 12px',
                  background: 'var(--bg-soft)', borderRadius: 6, lineHeight: 1.6,
                }}>
                  ・4文字以上で設定してください<br />
                  ・初期パスワードと同じものは使用できません
                </div>
                <div className="modal-footer" style={{ marginTop: 16, padding: '12px 0 0', background: 'transparent', borderTop: 'none' }}>
                  <button type="submit" className="btn btn-primary btn-block" disabled={flLoading}>
                    {flLoading ? '設定中...' : 'パスワードを設定して続ける / Set Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
