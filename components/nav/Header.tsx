'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { apiLogout, IS_DEMO } from '@/lib/api'

interface HeaderProps {
  userName: string
  role: 'user' | 'admin'
  empId?: string
}

export default function Header({ userName, role, empId }: HeaderProps) {
  const router = useRouter()
  const [clock, setClock] = useState('--:--:--')

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
  const subLabel = role === 'admin' ? 'ADMIN PORTAL' : 'USER PORTAL'
  const roleLabel = role === 'admin' ? 'ADMIN' : empId || 'USER'

  return (
    <header className="app-header">
      <div className="header-brand" onClick={handleBrandClick} title="クリックで打刻画面へ">
        <div className="header-logo-mark">
          <Image src="/logo-mark.png" alt="B" width={44} height={44} priority />
        </div>
        <div className="header-title-block">
          <span className="header-title">B-Attendance</span>
          <span className="header-title-sub">{subLabel}</span>
        </div>
      </div>

      <div className="header-right">
        <div className="header-clock">{clock}</div>
        <div className="header-user">
          <div className="header-user-avatar">{initial}</div>
          <div className="header-user-info">
            <div className="header-user-name">{userName}</div>
            <div className="header-user-role">{roleLabel}</div>
          </div>
        </div>
        <button className="header-logout-btn" onClick={handleLogout}>
          <svg className="icon-svg-sm"><use href="#i-power" /></svg>
          ログアウト
        </button>
      </div>
    </header>
  )
}
