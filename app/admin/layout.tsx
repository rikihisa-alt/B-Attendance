'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/nav/Header'
import { IS_DEMO, apiGetSession } from '@/lib/api'
import { useState } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    async function checkSession() {
      if (IS_DEMO) {
        const res = await apiGetSession()
        const data = await res.json()
        if (!data.session || data.session.type !== 'admin') {
          router.push('/login')
          return
        }
        setUserName(data.session.name || 'Admin')
      } else {
        setUserName('Admin')
      }
      setLoading(false)
    }
    checkSession()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>読み込み中...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Header userName={userName} role="admin" />
      <main className="px-7 py-[22px] pb-[60px] max-w-[1500px] mx-auto">
        {children}
      </main>
    </div>
  )
}
