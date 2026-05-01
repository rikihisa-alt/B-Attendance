'use client'

import { useState, useEffect, useCallback } from 'react'
import { IS_DEMO, apiGetSession, apiGetAttendance, apiClock, apiCancelClock } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { calcDay, getAvailableActions, liveEvents, sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes, fmtDate } from '@/lib/format'
import type { AttendanceEvent, AttendanceEventType } from '@/types/db'
import { LogIn, Coffee, CoffeeIcon, LogOut } from 'lucide-react'

const TYPE_LABELS: Record<AttendanceEventType, string> = {
  in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
}

const TYPE_COLORS: Record<AttendanceEventType, string> = {
  in: 'var(--green)', break_start: 'var(--orange)', break_end: 'var(--teal)', out: 'var(--red)',
}

export default function HomePage() {
  const [events, setEvents] = useState<AttendanceEvent[]>([])
  const [empId, setEmpId] = useState('')
  const [loading, setLoading] = useState(true)
  const [clockingType, setClockingType] = useState<AttendanceEventType | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null)
  const [now, setNow] = useState(new Date())

  // リアルタイム更新
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // 初回データ取得
  const fetchToday = useCallback(async () => {
    let currentEmpId = ''

    if (IS_DEMO) {
      const sessRes = await apiGetSession()
      const sessData = await sessRes.json()
      if (!sessData.session || sessData.session.type !== 'user') return
      currentEmpId = sessData.session.empId
    } else {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      currentEmpId = session.user.app_metadata?.emp_id
    }

    setEmpId(currentEmpId)
    const dateStr = fmtDate(new Date())

    if (IS_DEMO) {
      const res = await apiGetAttendance(currentEmpId, dateStr, dateStr)
      const data = await res.json()
      const rec = data.data?.[0]
      setEvents(rec?.events as AttendanceEvent[] || [])
    } else {
      const supabase = createClient()
      const { data } = await supabase
        .from('attendance')
        .select('events')
        .eq('emp_id', currentEmpId)
        .eq('date', dateStr)
        .single()
      setEvents(data?.events as AttendanceEvent[] || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchToday()
  }, [fetchToday])

  // 打刻
  const handleClock = async (type: AttendanceEventType) => {
    setClockingType(type)
    try {
      let res: Response
      if (IS_DEMO) {
        res = await apiClock(empId, type)
      } else {
        res = await fetch('/api/attendance/clock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        })
      }
      const data = await res.json()
      if (res.ok) {
        setEvents(data.events)
        showToast(`${TYPE_LABELS[type]}を記録しました`, 'success')
      } else {
        showToast(data.error || '打刻に失敗しました', 'error')
      }
    } catch {
      showToast('通信エラーが発生しました', 'error')
    }
    setClockingType(null)
  }

  // LIFOキャンセル
  const handleCancel = async (type: AttendanceEventType) => {
    try {
      let res: Response
      if (IS_DEMO) {
        res = await apiCancelClock(empId, type)
      } else {
        res = await fetch('/api/attendance/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        })
      }
      const data = await res.json()
      if (res.ok) {
        setEvents(data.events)
        showToast(data.message, 'info')
      } else {
        showToast(data.error || 'キャンセルに失敗しました', 'error')
      }
    } catch {
      showToast('通信エラーが発生しました', 'error')
    }
  }

  const showToast = (msg: string, type: string) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const dayCalc = calcDay(events)
  const actions = getAvailableActions(events)
  const live = liveEvents(events)
  const allSorted = sortedEvents(events)

  // キャンセル可能判定: 最後のliveイベントの60秒以内
  const lastLive = live[live.length - 1]
  const cancelRemaining = lastLive
    ? Math.max(0, 60 - Math.floor((now.getTime() - new Date(lastLive.time).getTime()) / 1000))
    : 0

  // 現在のステータステキスト
  const statusText = dayCalc.isWorking
    ? '勤務中'
    : dayCalc.isOnBreak
      ? '休憩中'
      : dayCalc.isAfterOut
        ? '退勤済み'
        : '未出勤'

  const statusColor = dayCalc.isWorking
    ? 'var(--green)'
    : dayCalc.isOnBreak
      ? 'var(--orange)'
      : dayCalc.isAfterOut
        ? 'var(--text-muted)'
        : 'var(--text-faint)'

  const buttons: { type: AttendanceEventType; icon: React.ReactNode; label: string }[] = [
    { type: 'in', icon: <LogIn size={20} />, label: '出勤' },
    { type: 'break_start', icon: <Coffee size={20} />, label: '休憩開始' },
    { type: 'break_end', icon: <CoffeeIcon size={20} />, label: '休憩終了' },
    { type: 'out', icon: <LogOut size={20} />, label: '退勤' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>読み込み中...</span>
      </div>
    )
  }

  return (
    <div>
      {/* ページヘッダー */}
      <div className="mb-5 pb-3 border-b-2" style={{ borderColor: 'var(--primary)' }}>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[20px] font-bold">打刻</h1>
          <span className="text-[10px] font-mono tracking-[0.16em]" style={{ color: 'var(--text-faint)' }}>CLOCK IN / OUT</span>
        </div>
      </div>

      {/* ステータスカード */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 rounded-full" style={{ background: statusColor }} />
          <span className="text-[16px] font-bold">{statusText}</span>
          <span className="font-mono text-[13px] ml-auto" style={{ color: 'var(--primary)' }}>
            {now.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false })}
          </span>
        </div>

        {dayCalc.firstIn && (
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>出勤</div>
              <div className="text-[16px] font-mono font-bold">{fmtTimeShort(dayCalc.firstIn)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>実働</div>
              <div className="text-[16px] font-mono font-bold">{formatMinutes(dayCalc.totalWorked)}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>休憩</div>
              <div className="text-[16px] font-mono font-bold">{formatMinutes(dayCalc.totalBreak)}</div>
            </div>
          </div>
        )}
      </div>

      {/* 打刻ボタン */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {buttons.map(({ type, icon, label }) => {
          const action = actions[type]
          const isClocking = clockingType === type
          const canCancel = cancelRemaining > 0 && lastLive?.type === type

          return (
            <div key={type} className="relative">
              <button
                onClick={() => handleClock(type)}
                disabled={!action.enabled || isClocking}
                className="w-full py-5 px-4 rounded-xl border-2 font-mincho text-[15px] font-bold cursor-pointer transition-all flex flex-col items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  borderColor: action.enabled ? TYPE_COLORS[type] : 'var(--border)',
                  color: action.enabled ? TYPE_COLORS[type] : 'var(--text-faint)',
                  background: action.enabled ? `${TYPE_COLORS[type]}10` : 'var(--bg-soft)',
                }}
                title={action.reason}
              >
                {icon}
                {isClocking ? '記録中...' : label}
              </button>

              {/* LIFOキャンセルオーバーレイ */}
              {canCancel && (
                <button
                  onClick={() => handleCancel(type)}
                  className="absolute -top-2 -right-2 text-[10px] font-mono font-bold text-white px-2 py-1 rounded-md cursor-pointer border-none transition-all"
                  style={{ background: 'var(--red)' }}
                >
                  取消 {cancelRemaining}s
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* タイムライン */}
      {allSorted.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: 'var(--shadow-xs)' }}>
          <h3 className="text-[13px] font-bold mb-3">
            本日のタイムライン
            <span className="font-mono text-[10px] font-normal ml-2 tracking-wider" style={{ color: 'var(--text-faint)' }}>TIMELINE</span>
          </h3>
          <div className="space-y-2">
            {allSorted.map((ev, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg text-[13px] ${ev.cancelled ? 'line-through opacity-50' : ''}`}
                style={{ background: ev.cancelled ? 'var(--bg-soft)' : 'transparent' }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ev.cancelled ? 'var(--text-faint)' : TYPE_COLORS[ev.type] }} />
                <span className="font-mono text-[13px] font-medium" style={{ color: ev.cancelled ? 'var(--text-faint)' : 'var(--text)' }}>
                  {fmtTimeShort(ev.time)}
                </span>
                <span style={{ color: ev.cancelled ? 'var(--text-faint)' : 'var(--text-soft)' }}>
                  {TYPE_LABELS[ev.type]}
                </span>
                {ev.cancelled && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
                    取消済
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-5 py-3 rounded-xl text-[13px] font-semibold z-50 transition-all"
          style={{
            background: toast.type === 'success' ? 'var(--green)' : toast.type === 'error' ? 'var(--red)' : 'var(--primary)',
            color: 'white',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
