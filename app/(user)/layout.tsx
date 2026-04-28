import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Header from '@/components/nav/Header'
import Sidebar from '@/components/nav/Sidebar'

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const empId = session.user.app_metadata?.emp_id || ''

  // 従業員情報を取得
  const { data: emp } = await supabase
    .from('employees')
    .select('name')
    .eq('id', empId)
    .single()

  const userName = emp?.name || empId

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
