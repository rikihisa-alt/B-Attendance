'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/nav/Header'
import Sidebar from '@/components/nav/Sidebar'
import { useSession } from '@/hooks/useSession'

export default function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { empId, userName, role, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !userName) {
      router.push('/login')
    }
  }, [loading, userName, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>読み込み中...</span>
      </div>
    )
  }

  if (!userName) return null

  return (
    <div className="app-shell">
      <Header userName={userName} role="user" empId={empId} />
      <div className="app-body">
        <Sidebar />
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
