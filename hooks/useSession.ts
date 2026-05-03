'use client'

import { useState, useEffect } from 'react'
import { IS_DEMO, apiGetSession } from '@/lib/api'

interface SessionInfo {
  empId: string
  userName: string
  role: 'user' | 'admin'
  loading: boolean
}

export function useSession(): SessionInfo {
  const [info, setInfo] = useState<SessionInfo>({
    empId: '', userName: '', role: 'user', loading: true,
  })

  useEffect(() => {
    async function load() {
      if (IS_DEMO) {
        const res = await apiGetSession()
        const data = await res.json()
        if (data.session && data.session.type === 'user') {
          setInfo({
            empId: data.session.empId,
            userName: data.session.name,
            role: 'user',
            loading: false,
          })
        } else if (data.session && data.session.type === 'admin') {
          setInfo({
            empId: '',
            userName: data.session.name,
            role: 'admin',
            loading: false,
          })
        } else {
          setInfo(prev => ({ ...prev, loading: false }))
        }
      } else {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        const data = await res.json()
        if (data.session) {
          setInfo({
            empId: data.session.empId,
            userName: data.session.name || data.session.empId,
            role: 'user',
            loading: false,
          })
        } else {
          setInfo(prev => ({ ...prev, loading: false }))
        }
      }
    }
    load()
  }, [])

  return info
}
