'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { IS_DEMO, apiGetSession, apiGetAttendance, apiClock, apiCancelClock, apiLogout, userSelect } from '@/lib/api'
import { calcDay, getAvailableActions, liveEvents, sortedEvents } from '@/lib/attendance'
import { fmtTimeShort, formatMinutes } from '@/lib/format'
import { useCachedState, hasCached } from '@/lib/cache'
import type { Attendance, AttendanceEvent, AttendanceEventType } from '@/types/db'

const CK = 'user-home:'

const TYPE_LABEL_JA: Record<AttendanceEventType, string> = {
  in: '出勤',
  break_start: '休憩開始',
  break_end: '休憩終了',
  out: '退勤',
}
const TYPE_LABEL_EN: Record<AttendanceEventType, string> = {
  in: 'CLOCK IN',
  break_start: 'BREAK START',
  break_end: 'BREAK END',
  out: 'CLOCK OUT',
}
const TYPE_ICON: Record<AttendanceEventType, string> = {
  in: 'i-in',
  break_start: 'i-break-start',
  break_end: 'i-break-end',
  out: 'i-out',
}
const TYPE_TIMELINE_CLASS: Record<AttendanceEventType, string> = {
  in: 't-in',
  break_start: 't-bs',
  break_end: 't-be',
  out: 't-out',
}

function todayIsoDate() {
  // Asia/Tokyo の日付を YYYY-MM-DD で返す
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })
  return fmt.format(new Date())
}

function fmtIsoDateLabel(d: Date) {
  // ja-JP の Intl.DateTimeFormat は環境によって "2026年5月3日(日)" や
  // "2026/5/3(日)" など括弧が半角/全角で揺れるため、曜日だけ別フォーマッタで取って
  // 日付部分は en-CA (YYYY-MM-DD) で確定させる。
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
  const [y, m, da] = ymd.split('-')
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', weekday: 'short',
  }).format(d)
  return `${y}/${m}/${da} (${weekday})`
}

export default function HomePage() {
  const router = useRouter()
  const [events, setEvents] = useCachedState<AttendanceEvent[]>(CK + 'events', [])
  const [empId, setEmpId] = useCachedState<string>(CK + 'empId', '')
  const [userName, setUserName] = useCachedState<string>(CK + 'userName', '')
  const [loading, setLoading] = useState<boolean>(() => !hasCached(CK + 'events'))
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const fetchToday = useCallback(async () => {
    let currentEmpId = ''
    let name = ''

    if (IS_DEMO) {
      const sessRes = await apiGetSession()
      const sessData = await sessRes.json()
      if (!sessData.session || sessData.session.type !== 'user') return
      currentEmpId = sessData.session.empId
      name = sessData.session.name || ''
    } else {
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' })
      const meData = await meRes.json()
      if (!meData.session) return
      currentEmpId = meData.session.empId
      name = meData.session.name || ''
    }

    setEmpId(currentEmpId)
    setUserName(name)
    const dateStr = todayIsoDate()

    if (IS_DEMO) {
      const res = await apiGetAttendance(currentEmpId, dateStr, dateStr)
      const data = await res.json()
      const rec = data.data?.[0]
      setEvents((rec?.events as AttendanceEvent[]) || [])
    } else {
      const { data } = await userSelect<Attendance>({
        table: 'attendance',
        columns: 'events',
        filters: { date: dateStr },
        single: true,
      })
      setEvents((data?.events as AttendanceEvent[]) || [])
    }
    setLoading(false)
  }, [setEvents, setEmpId, setUserName])

  useEffect(() => { fetchToday() }, [fetchToday])

  const handleClock = async (type: AttendanceEventType) => {
    try {
      const res = IS_DEMO
        ? await apiClock(empId, type)
        : await fetch('/api/attendance/clock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
          })
      const data = await res.json()
      if (res.ok) setEvents(data.events)
    } catch {
      // ignore
    }
  }

  const handleCancel = async (type: AttendanceEventType) => {
    try {
      const res = IS_DEMO
        ? await apiCancelClock(empId, type)
        : await fetch('/api/attendance/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type }),
          })
      const data = await res.json()
      if (res.ok) setEvents(data.events)
    } catch {
      // ignore
    }
  }

  const handleLogout = async () => {
    if (IS_DEMO) await apiLogout()
    else await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  // 表示用の計算
  const dayCalc = calcDay(events)
  const actions = getAvailableActions(events)
  const live = liveEvents(events)
  const allSorted = sortedEvents(events)
  const lastLive = live[live.length - 1]
  const cancelRemaining = lastLive
    ? Math.max(0, 60 - Math.floor((now.getTime() - new Date(lastLive.time).getTime()) / 1000))
    : 0

  // 各タイプの最新打刻時刻 + 件数
  const perType = (type: AttendanceEventType) => {
    const list = live.filter(e => e.type === type)
    const last = list[list.length - 1]
    return {
      time: last ? fmtTimeShort(last.time) : '--:--',
      count: list.length,
    }
  }

  // 大時計表示（now ベース）
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const dateLabel = fmtIsoDateLabel(now)

  // ステータス
  let statusClass = ''
  let statusText = '未出勤 / Idle'
  if (dayCalc.isWorking) { statusClass = 'working'; statusText = '勤務中 / Working' }
  else if (dayCalc.isOnBreak) { statusClass = 'break'; statusText = '休憩中 / Break' }
  else if (dayCalc.isAfterOut) { statusClass = 'done'; statusText = '退勤済 / Done' }

  // 勤務中・休憩中なら「from XX:XX〜」を表示
  let sinceLabel = '—'
  if (lastLive) {
    if (dayCalc.isWorking || dayCalc.isOnBreak) {
      sinceLabel = `from ${fmtTimeShort(lastLive.time)}`
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
        読み込み中...
      </div>
    )
  }

  const renderClockBtn = (type: AttendanceEventType) => {
    const action = actions[type]
    const t = perType(type)
    const canCancel = cancelRemaining > 0 && lastLive?.type === type
    const enabledClass = action.enabled ? 'enabled' : 'disabled'
    const recordedClass = t.count > 0 ? ' recorded' : ''
    return (
      <button
        key={type}
        type="button"
        className={`clock-btn ${enabledClass}${recordedClass}`}
        data-action={type === 'in' ? 'in' : type === 'out' ? 'out' : type}
        onClick={() => action.enabled && handleClock(type)}
      >
        <div className="clock-btn-icon-wrap">
          <svg><use href={`#${TYPE_ICON[type]}`} /></svg>
        </div>
        <div className="clock-btn-text-block">
          <span className="clock-btn-label-ja">{TYPE_LABEL_JA[type]}</span>
          <span className="clock-btn-label-en">{TYPE_LABEL_EN[type]}</span>
        </div>
        <div className="clock-btn-bottom">
          <span className={`clock-btn-time${t.count > 0 ? ' active' : ''}`}>{t.time}</span>
          {t.count > 0 && <span className="clock-btn-count">×{t.count}</span>}
        </div>
        {!action.enabled && action.reason && (
          <div className="clock-btn-disabled-reason">{action.reason}</div>
        )}
        <div
          className={`cancel-side-btn${canCancel ? ' show' : ''}`}
          onClick={e => { e.stopPropagation(); if (canCancel) handleCancel(type) }}
        >
          <div className="cancel-side-label">取消</div>
          <div className="cancel-side-countdown">{cancelRemaining}s</div>
          <div className="cancel-side-hint">CANCEL</div>
        </div>
      </button>
    )
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">打刻</span>
          <span className="page-title-en">CLOCK / {dateLabel}</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">{userName || '--'}</span>さん、お疲れ様です。
          </div>
          <div className="greeting-meta">
            <span>{dateLabel}</span>
            <span className="greeting-meta-en"> / {empId || '--'}</span>
          </div>
        </div>
      </div>

      <div className="clock-panel">
        <div className="clock-panel-header">
          <div className="clock-panel-title">
            <span className="live-dot"></span>LIVE / 打刻パネル
          </div>
          <div className="clock-panel-meta">複数回打刻対応 / Multi-punch</div>
        </div>
        <div className="clock-grid">
          <div className="clock-display">
            <div className="clock-time">
              <span>{hh}:{mm}</span>
              <span className="seconds">:{ss}</span>
            </div>
            <div className="clock-date">{dateLabel}</div>
            <div className="clock-status-row">
              <div className={`clock-status ${statusClass}`}>
                <span className="indicator"></span>
                <span>{statusText}</span>
              </div>
              <span className="clock-since">{sinceLabel}</span>
            </div>
          </div>
          <div className="clock-buttons">
            {renderClockBtn('in')}
            {renderClockBtn('break_start')}
            {renderClockBtn('break_end')}
            {renderClockBtn('out')}
          </div>
        </div>
        <div className="clock-actions">
          <div className="clock-actions-info">
            押せるボタンのみ点灯します。<b>退勤後に再度出勤</b>すると新しい勤務セッションとして扱われます。
          </div>
          <button className="btn btn-danger btn-sm" onClick={handleLogout}>
            <svg className="icon-svg-sm"><use href="#i-power" /></svg>
            ログアウト
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card color-orange">
          <div className="stat-icon-box"><svg><use href="#i-in" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">最初の出勤</span>
              <span className="stat-label-en">FIRST IN</span>
            </div>
            <div className="stat-value">{dayCalc.firstIn ? fmtTimeShort(dayCalc.firstIn) : '--:--'}</div>
          </div>
        </div>
        <div className="stat-card color-green">
          <div className="stat-icon-box"><svg><use href="#i-out" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">最後の退勤</span>
              <span className="stat-label-en">LAST OUT</span>
            </div>
            <div className="stat-value">{dayCalc.lastOut ? fmtTimeShort(dayCalc.lastOut) : '--:--'}</div>
          </div>
        </div>
        <div className="stat-card color-yellow">
          <div className="stat-icon-box"><svg><use href="#i-break-start" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">休憩合計</span>
              <span className="stat-label-en">BREAK</span>
            </div>
            <div className="stat-value">{dayCalc.totalBreak}<span className="stat-unit">分</span></div>
          </div>
        </div>
        <div className="stat-card color-blue">
          <div className="stat-icon-box"><svg><use href="#i-stopwatch" /></svg></div>
          <div className="stat-info">
            <div className="stat-label-block">
              <span className="stat-label-ja">実働合計</span>
              <span className="stat-label-en">WORKED</span>
            </div>
            <div className="stat-value">{formatMinutes(dayCalc.totalWorked)}<span className="stat-unit">時間</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">
              本日の打刻履歴{' '}
              <span className="text-muted" style={{ fontWeight: 400, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                {allSorted.length}件（有効{live.length}件）
              </span>
            </span>
            <span className="card-title-en">PUNCH LOG / TODAY</span>
          </div>
        </div>
        <div className="card-body">
          <ul className="timeline">
            {allSorted.length === 0 ? (
              <li className="text-muted">
                <svg className="icon-svg-sm"><use href="#i-empty-mail" /></svg>
                打刻記録はまだありません
              </li>
            ) : (
              allSorted.map((ev, i) => (
                <li
                  key={i}
                  className={`${TYPE_TIMELINE_CLASS[ev.type]}${ev.cancelled ? ' cancelled' : ''}`}
                >
                  <span className="timeline-time">{fmtTimeShort(ev.time)}</span>
                  <div className="timeline-icon">
                    <svg><use href={`#${TYPE_ICON[ev.type]}`} /></svg>
                  </div>
                  <div className="timeline-label-block">
                    <span className="timeline-label-ja">{TYPE_LABEL_JA[ev.type]}</span>
                    <span className="timeline-label-en">{TYPE_LABEL_EN[ev.type]}</span>
                  </div>
                  <span className="timeline-num">#{i + 1}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  )
}
