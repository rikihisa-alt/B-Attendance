'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { apiLogout, IS_DEMO } from '@/lib/api'

interface HeaderProps {
  userName: string
  role: 'user' | 'admin'
  empId?: string
}

export default function Header({ userName, role, empId }: HeaderProps) {
  const router = useRouter()
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const handleBrandClick = () => {
    router.push(role === 'admin' ? '/admin/dashboard' : '/home')
  }

  const handleLogout = async () => {
    if (IS_DEMO) {
      await apiLogout()
    } else {
      await fetch('/api/auth/logout', { method: 'POST' })
    }
    router.push('/login')
    router.refresh()
  }

  const initial = userName ? userName.charAt(0) : '?'

  return (
    <header
      className="bg-card border-b border-border px-6 h-[60px] flex items-center justify-between sticky top-0 z-50"
    >
      {/* ロゴ */}
      <div
        className="flex items-center gap-[12px] cursor-pointer select-none py-1 px-2 -ml-2 rounded-lg"
        style={{ transition: 'background 0.15s ease' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        onClick={handleBrandClick}
      >
        <div className="flex flex-col leading-tight">
          <span className="text-[17px] font-bold" style={{ letterSpacing: '0.03em' }}>B-Attendance</span>
          <span className="text-[10px] font-mono tracking-[0.15em]" style={{ color: 'var(--text-muted)' }}>
            {role === 'admin' ? 'ADMIN PORTAL' : 'USER PORTAL'}
          </span>
        </div>
      </div>

      {/* 右側 */}
      <div className="flex items-center gap-3">
        {/* 時計 */}
        <div
          className="font-mono text-[13px] px-3 py-[7px] rounded-md"
          style={{ color: 'var(--primary)', background: 'var(--primary-bg)', border: '1px solid var(--border)', letterSpacing: '0.06em', borderRadius: '6px' }}
        >
          {clock}
        </div>

        {/* ユーザー情報 */}
        <div className="flex items-center gap-2.5 px-3 py-[5px] pl-[5px] border border-border rounded-3xl" style={{ background: 'var(--bg-soft)' }}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[12px] text-white"
            style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-light))' }}
          >
            {initial}
          </div>
          <div className="leading-tight">
            <div className="text-[12px] font-semibold">{userName}</div>
            <div className="text-[9px] font-mono tracking-[0.15em]" style={{ color: 'var(--text-muted)' }}>
              {role === 'admin' ? 'ADMIN' : empId || 'USER'}
            </div>
          </div>
        </div>

        {/* ログアウト */}
        <button
          onClick={handleLogout}
          className="px-3.5 py-[7px] text-[12px] font-semibold cursor-pointer rounded-md transition-all flex items-center gap-1.5"
          style={{
            background: 'var(--card)', color: 'var(--text)',
            border: '1px solid var(--border-strong)', fontFamily: 'inherit',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-bg)'; e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.borderColor = 'var(--red)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        >
          <LogOut size={14} />
          ログアウト
        </button>
      </div>
    </header>
  )
}
