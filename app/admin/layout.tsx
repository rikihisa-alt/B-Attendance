'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/nav/Header'
import AdminSidebar from '@/components/nav/AdminSidebar'
import { adminSelect } from '@/lib/api'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [pendingCorrections, setPendingCorrections] = useState(0)
  const [pendingLeaves, setPendingLeaves] = useState(0)

  // 認証は middleware で /admin/* に admin cookie を要求するためサーバー側で完結。
  useEffect(() => {
    async function loadBadges() {
      const [c, l] = await Promise.all([
        adminSelect({ table: 'correction_requests', filters: { status: 'pending' }, count_only: true }),
        adminSelect({ table: 'leave_requests', filters: { status: 'pending' }, count_only: true }),
      ])
      setPendingCorrections(c.count || 0)
      setPendingLeaves(l.count || 0)
    }
    loadBadges()
  }, [])

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
