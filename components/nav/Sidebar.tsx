'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  href: string
  iconId: string
  labelJa: string
  labelEn: string
  badge?: number
}

export default function Sidebar() {
  const pathname = usePathname()

  const workItems: NavItem[] = [
    { href: '/home', iconId: 'i-clock', labelJa: '打刻', labelEn: 'CLOCK' },
    { href: '/history', iconId: 'i-list', labelJa: '勤怠履歴', labelEn: 'HISTORY' },
    { href: '/requests', iconId: 'i-edit', labelJa: '修正申請', labelEn: 'REQUESTS' },
  ]
  const accountItems: NavItem[] = [
    { href: '/profile', iconId: 'i-user', labelJa: 'マイページ', labelEn: 'MY PROFILE' },
  ]

  const renderItem = (item: NavItem) => {
    const isActive = pathname === item.href
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch
        className={`nav-item${isActive ? ' active' : ''}`}
        style={{ textDecoration: 'none' }}
      >
        <span className="nav-item-content">
          <svg className="icon-svg-sm"><use href={`#${item.iconId}`} /></svg>
          <span className="nav-item-text">
            <span className="ja">{item.labelJa}</span>
            <span className="en">{item.labelEn}</span>
          </span>
        </span>
        {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
      </Link>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="nav-section-label">勤怠 / WORK</div>
        {workItems.map(renderItem)}
      </div>
      <div className="sidebar-section">
        <div className="nav-section-label">アカウント / ACCOUNT</div>
        {accountItems.map(renderItem)}
      </div>
      <div className="sidebar-footer">B-ATTENDANCE / V1.0</div>
    </aside>
  )
}
