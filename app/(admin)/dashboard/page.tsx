export default function AdminDashboardPage() {
  return (
    <div className="p-8">
      <div className="mb-5 pb-3 border-b-2" style={{ borderColor: 'var(--primary)' }}>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[20px] font-bold">ダッシュボード</h1>
          <span className="text-[10px] font-mono tracking-[0.16em]" style={{ color: 'var(--text-faint)' }}>ADMIN DASHBOARD</span>
        </div>
      </div>
      <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>管理者ダッシュボード — 実装予定</p>
    </div>
  )
}
