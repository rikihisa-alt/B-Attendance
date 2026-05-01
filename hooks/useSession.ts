'use client'

import { useState, useEffect } from 'react'
import { IS_DEMO, apiGetSession, apiGetEmployee } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'

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
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const empId = session.user.app_metadata?.emp_id || ''
          const { data: emp } = await supabase
            .from('employees')
            .select('name')
            .eq('id', empId)
            .single()
          setInfo({
            empId,
            userName: emp?.name || empId,
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
