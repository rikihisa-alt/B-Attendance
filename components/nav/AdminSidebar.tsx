'use client'

import { usePathname, useRouter } from 'next/navigation'

interface NavItem {
  href: string
  iconId: string
  labelJa: string
  labelEn: string
  badge?: number
}

interface AdminSidebarProps {
  pendingCorrections?: number
  pendingLeaves?: number
}

export default function AdminSidebar({ pendingCorrections, pendingLeaves }: AdminSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const items: NavItem[] = [
    { href: '/admin/dashboard', iconId: 'i-dashboard', labelJa: 'ダッシュボード', labelEn: 'DASHBOARD' },
    { href: '/admin/attendance', iconId: 'i-list', labelJa: '勤怠一覧', labelEn: 'RECORDS' },
    { href: '/admin/corrections', iconId: 'i-check', labelJa: '承認待ち', labelEn: 'APPROVALS', badge: pendingCorrections },
    { href: '/admin/leaves', iconId: 'i-calendar', labelJa: '休暇承認', labelEn: 'LEAVE APPROVALS', badge: pendingLeaves },
    { href: '/admin/overtime', iconId: 'i-warning', labelJa: '残業管理', labelEn: 'OVERTIME' },
    { href: '/admin/employees', iconId: 'i-users', labelJa: '従業員管理', labelEn: 'EMPLOYEES' },
    { href: '/admin/audit', iconId: 'i-list', labelJa: 'ログ閲覧', labelEn: 'AUDIT LOG' },
    { href: '/admin/reports', iconId: 'i-download', labelJa: 'レポート出力', labelEn: 'EXPORT' },
    { href: '/admin/settings', iconId: 'i-edit', labelJa: '設定', labelEn: 'SETTINGS' },
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="nav-section-label">管理 / ADMIN</div>
        {items.map(item => {
          const isActive = pathname === item.href
          return (
            <button
              key={item.href}
              type="button"
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => router.push(item.href)}
            >
              <span className="nav-item-content">
                <svg className="icon-svg-sm"><use href={`#${item.iconId}`} /></svg>
                <span className="nav-item-text">
                  <span className="ja">{item.labelJa}</span>
                  <span className="en">{item.labelEn}</span>
                </span>
              </span>
              {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
            </button>
          )
        })}
      </div>
      <div className="sidebar-footer">B-ATTENDANCE / V1.0</div>
    </aside>
  )
}
