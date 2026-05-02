'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/nav/Header'
import AdminSidebar from '@/components/nav/AdminSidebar'
import { IS_DEMO, apiGetSession, apiGetCorrections, apiGetLeaves, adminSelect } from '@/lib/api'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [pendingCorrections, setPendingCorrections] = useState(0)
  const [pendingLeaves, setPendingLeaves] = useState(0)

  useEffect(() => {
    async function checkSession() {
      if (IS_DEMO) {
        const res = await apiGetSession()
        const data = await res.json()
        if (!data.session || data.session.type !== 'admin') {
          router.push('/login')
          return
        }
      }
      // 非DEMOではmiddleware/api側で認証チェック済み
      setLoading(false)
    }
    checkSession()
  }, [router])

  useEffect(() => {
    if (loading) return
    async function loadBadges() {
      if (IS_DEMO) {
        const [c, l] = await Promise.all([
          apiGetCorrections(undefined, 'pending'),
          apiGetLeaves(undefined, 'pending'),
        ])
        const cd = await c.json()
        const ld = await l.json()
        setPendingCorrections(cd.data?.length || 0)
        setPendingLeaves(ld.data?.length || 0)
      } else {
        const [c, l] = await Promise.all([
          adminSelect({ table: 'correction_requests', filters: { status: 'pending' }, count_only: true }),
          adminSelect({ table: 'leave_requests', filters: { status: 'pending' }, count_only: true }),
        ])
        setPendingCorrections(c.count || 0)
        setPendingLeaves(l.count || 0)
      }
    }
    loadBadges()
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>読み込み中...</span>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header userName="管理者" role="admin" />
      <div className="app-body">
        <AdminSidebar pendingCorrections={pendingCorrections} pendingLeaves={pendingLeaves} />
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
