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
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header userName={userName} role="user" empId={empId} />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-7 py-[22px] pb-[60px] max-w-[1500px]">
          {children}
        </main>
      </div>
    </div>
  )
}
