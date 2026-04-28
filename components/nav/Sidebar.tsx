'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Clock, List, FileEdit, Calendar, User } from 'lucide-react'
import { ReactNode } from 'react'

interface NavItem {
  href: string
  icon: ReactNode
  labelJa: string
  labelEn: string
  badge?: number
}

interface SidebarProps {
  pendingCount?: number
}

export default function Sidebar({ pendingCount }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const items: NavItem[] = [
    { href: '/home', icon: <Clock size={14} />, labelJa: '打刻', labelEn: 'CLOCK' },
    { href: '/history', icon: <List size={14} />, labelJa: '勤怠履歴', labelEn: 'HISTORY' },
    { href: '/requests', icon: <FileEdit size={14} />, labelJa: '修正申請', labelEn: 'REQUESTS' },
    { href: '/leaves', icon: <Calendar size={14} />, labelJa: '休暇申請', labelEn: 'LEAVES', badge: pendingCount },
    { href: '/profile', icon: <User size={14} />, labelJa: 'マイページ', labelEn: 'PROFILE' },
  ]

  return (
    <aside className="bg-card border-r border-border py-4 flex flex-col sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto w-[200px] flex-shrink-0">
      <div>
        <div className="px-[22px] py-[10px] pb-1.5 text-[10px] font-mono font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--text-faint)' }}>
          MENU
        </div>
        {items.map(item => {
          const isActive = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`flex items-center justify-between w-full text-left px-[22px] py-[10px] text-[13px] font-medium cursor-pointer transition-all border-none bg-transparent ${
                isActive ? 'font-bold' : ''
              }`}
              style={{
                color: isActive ? 'var(--primary)' : 'var(--text-soft)',
                background: isActive ? 'var(--primary-pale)' : 'transparent',
                borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                fontFamily: 'inherit',
              }}
            >
              <span className="flex items-center gap-2.5">
                {item.icon}
                <span className="flex flex-col leading-tight">
                  <span className="text-[13px]">{item.labelJa}</span>
                  <span
                    className="text-[9px] font-mono tracking-[0.12em]"
                    style={{ color: isActive ? 'var(--primary-light)' : 'var(--text-faint)' }}
                  >
                    {item.labelEn}
                  </span>
                </span>
              </span>
              {item.badge && item.badge > 0 ? (
                <span className="text-white text-[10px] font-mono font-bold rounded-xl px-[7px] py-[2px] min-w-[20px] text-center" style={{ background: 'var(--orange)' }}>
                  {item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="mt-auto pt-3.5 px-[22px] border-t border-border font-mono text-[9px] text-center tracking-[0.1em]" style={{ color: 'var(--text-faint)' }}>
        B-Attendance v2.0
      </div>
    </aside>
  )
}
