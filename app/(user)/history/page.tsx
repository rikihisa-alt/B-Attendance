'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { calcDay, liveEvents, sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes } from '@/lib/format'
import type { AttendanceEvent, Attendance } from '@/types/db'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
}

export default function HistoryPage() {
  const [monthStr, setMonthStr] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [records, setRecords] = useState<Record<string, Attendance>>({})
  const [loading, setLoading] = useState(true)
  const [detailDate, setDetailDate] = useState<string | null>(null)

  const supabase = createClient()

  const fetchMonth = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const empId = session.user.app_metadata?.emp_id
    const [y, m] = monthStr.split('-').map(Number)
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('emp_id', empId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    const map: Record<string, Attendance> = {}
    data?.forEach(r => { map[r.date] = r as Attendance })
    setRecords(map)
    setLoading(false)
  }, [supabase, monthStr])

  useEffect(() => {
    fetchMonth()
  }, [fetchMonth])

  // 月のすべての日を取得
  const [y, m] = monthStr.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  })

  // 月ナビゲーション
  const changeMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1)
    setMonthStr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // 月次集計
  let monthTotalWorked = 0
  let monthTotalBreak = 0
  let monthWorkDays = 0
  days.forEach(dateStr => {
    const rec = records[dateStr]
    if (rec) {
      const calc = calcDay(rec.events as AttendanceEvent[])
      if (calc.totalWorked > 0) {
        monthWorkDays++
        monthTotalWorked += calc.totalWorked
        monthTotalBreak += calc.totalBreak
      }
    }
  })

  const detailRec = detailDate ? records[detailDate] : null

  return (
    <div>
      {/* ページヘッダー */}
      <div className="mb-5 pb-3 border-b-2" style={{ borderColor: 'var(--primary)' }}>
        <div className="flex justify-between items-end">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[20px] font-bold">勤怠履歴</h1>
            <span className="text-[10px] font-mono tracking-[0.16em]" style={{ color: 'var(--text-faint)' }}>ATTENDANCE HISTORY</span>
          </div>
        </div>
      </div>

      {/* 月ナビ + 集計 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={() => changeMonth(-1)} className="p-1.5 rounded-md border border-border bg-card cursor-pointer hover:bg-hover">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[16px] font-bold font-mono">{y}年{m}月</span>
          <button onClick={() => changeMonth(1)} className="p-1.5 rounded-md border border-border bg-card cursor-pointer hover:bg-hover">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex gap-5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
          <span>出勤: <strong className="font-mono">{monthWorkDays}日</strong></span>
          <span>実働: <strong className="font-mono">{formatMinutes(monthTotalWorked)}</strong></span>
          <span>休憩: <strong className="font-mono">{formatMinutes(monthTotalBreak)}</strong></span>
        </div>
      </div>

      {/* カレンダーテーブル */}
      <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ boxShadow: 'var(--shadow-xs)' }}>
        {loading ? (
          <div className="text-center py-10 text-[13px]" style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
        ) : (
          <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color: 'var(--text-soft)' }}>日付</th>
                <th className="text-center px-4 py-2.5 font-semibold" style={{ color: 'var(--text-soft)' }}>出勤</th>
                <th className="text-center px-4 py-2.5 font-semibold" style={{ color: 'var(--text-soft)' }}>退勤</th>
                <th className="text-center px-4 py-2.5 font-semibold" style={{ color: 'var(--text-soft)' }}>休憩</th>
                <th className="text-center px-4 py-2.5 font-semibold" style={{ color: 'var(--text-soft)' }}>実働</th>
                <th className="text-center px-4 py-2.5 font-semibold" style={{ color: 'var(--text-soft)' }}>状態</th>
              </tr>
            </thead>
            <tbody>
              {days.map(dateStr => {
                const d = new Date(dateStr + 'T00:00:00+09:00')
                const dow = d.getDay()
                const isWeekend = dow === 0 || dow === 6
                const dowChars = ['日', '月', '火', '水', '木', '金', '土']
                const rec = records[dateStr]
                const calc = rec ? calcDay(rec.events as AttendanceEvent[]) : null

                return (
                  <tr
                    key={dateStr}
                    onClick={() => setDetailDate(dateStr)}
                    className="cursor-pointer transition-colors hover:bg-hover"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isWeekend ? 'var(--red-bg)' : undefined,
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[12px]">{d.getDate()}</span>
                      <span className="ml-1.5 text-[12px]" style={{ color: isWeekend ? 'var(--red)' : 'var(--text-muted)' }}>
                        ({dowChars[dow]})
                      </span>
                    </td>
                    <td className="text-center font-mono px-4 py-2.5">{calc?.firstIn ? fmtTimeShort(calc.firstIn) : '-'}</td>
                    <td className="text-center font-mono px-4 py-2.5">{calc?.lastOut ? fmtTimeShort(calc.lastOut) : '-'}</td>
                    <td className="text-center font-mono px-4 py-2.5">{calc && calc.totalBreak > 0 ? formatMinutes(calc.totalBreak) : '-'}</td>
                    <td className="text-center font-mono px-4 py-2.5 font-semibold">{calc && calc.totalWorked > 0 ? formatMinutes(calc.totalWorked) : '-'}</td>
                    <td className="text-center px-4 py-2.5">
                      {calc?.isWorking && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>勤務中</span>}
                      {calc?.isOnBreak && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--orange-bg)', color: 'var(--orange)' }}>休憩中</span>}
                      {calc?.isAfterOut && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-soft)', color: 'var(--text-muted)' }}>退勤済</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 詳細モーダル */}
      {detailDate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setDetailDate(null)}>
          <div className="w-full max-w-lg bg-card rounded-2xl p-6 relative" style={{ boxShadow: 'var(--shadow-lg)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailDate(null)} className="absolute top-4 right-4 p-1 rounded-md hover:bg-hover cursor-pointer border-none bg-transparent">
              <X size={18} />
            </button>

            <h3 className="text-[16px] font-bold mb-4">
              {(() => {
                const d = new Date(detailDate + 'T00:00:00+09:00')
                const dowChars = ['日', '月', '火', '水', '木', '金', '土']
                return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${dowChars[d.getDay()]})`
              })()}
            </h3>

            {detailRec ? (
              <>
                {/* 集計 */}
                {(() => {
                  const calc = calcDay(detailRec.events as AttendanceEvent[])
                  return (
                    <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-soft)' }}>
                        <div className="text-[10px] font-mono mb-1" style={{ color: 'var(--text-faint)' }}>出勤</div>
                        <div className="font-mono font-bold">{calc.firstIn ? fmtTimeShort(calc.firstIn) : '-'}</div>
                      </div>
                      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-soft)' }}>
                        <div className="text-[10px] font-mono mb-1" style={{ color: 'var(--text-faint)' }}>退勤</div>
                        <div className="font-mono font-bold">{calc.lastOut ? fmtTimeShort(calc.lastOut) : '-'}</div>
                      </div>
                      <div className="p-3 rounded-lg" style={{ background: 'var(--bg-soft)' }}>
                        <div className="text-[10px] font-mono mb-1" style={{ color: 'var(--text-faint)' }}>実働</div>
                        <div className="font-mono font-bold">{formatMinutes(calc.totalWorked)}</div>
                      </div>
                    </div>
                  )
                })()}

                {/* 全イベント */}
                <div className="space-y-1.5">
                  {sortedEvents(detailRec.events as AttendanceEvent[]).map((ev, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-3 py-2 px-3 rounded-lg text-[13px] ${ev.cancelled ? 'line-through opacity-50' : ''}`}
                      style={{ background: ev.cancelled ? 'var(--bg-soft)' : 'transparent' }}
                    >
                      <span className="font-mono font-medium">{fmtTimeShort(ev.time)}</span>
                      <span style={{ color: 'var(--text-soft)' }}>{TYPE_LABELS[ev.type] || ev.type}</span>
                      {ev.cancelled && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>取消済</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* メモ */}
                {detailRec.note && (
                  <div className="mt-4 p-3 rounded-lg text-[13px]" style={{ background: 'var(--bg-soft)', color: 'var(--text-soft)' }}>
                    <strong>メモ:</strong> {detailRec.note}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>この日の記録はありません</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
