import { AttendanceEvent, AttendanceEventType } from '@/types/db'

/** 取消されていないイベントを時系列ソートで返す */
export function liveEvents(events: AttendanceEvent[]): AttendanceEvent[] {
  if (!events || events.length === 0) return []
  return [...events]
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    .filter(e => !e.cancelled)
}

/** イベント配列を時系列ソートで返す（cancelledも含む） */
export function sortedEvents(events: AttendanceEvent[]): AttendanceEvent[] {
  if (!events || events.length === 0) return []
  return [...events].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
}

interface Break { start: string | null; end: string | null }
interface Session {
  in: string | null
  out: string | null
  breaks: Break[]
  breakTotal: number
  worked: number
}

export interface DayCalc {
  sessions: Session[]
  firstIn: string | null
  lastOut: string | null
  totalWorked: number   // 分
  totalBreak: number    // 分
  inCount: number
  outCount: number
  breakCount: number
  isWorking: boolean
  isOnBreak: boolean
  isAfterOut: boolean
  eventCount: number
}

function diffMin(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

/** 1日の勤怠データを集計する */
export function calcDay(events: AttendanceEvent[] | undefined | null): DayCalc {
  const empty: DayCalc = {
    sessions: [], firstIn: null, lastOut: null,
    totalWorked: 0, totalBreak: 0,
    inCount: 0, outCount: 0, breakCount: 0,
    isWorking: false, isOnBreak: false, isAfterOut: false, eventCount: 0,
  }
  if (!events || events.length === 0) return empty

  const live = liveEvents(events)
  if (live.length === 0) return empty

  const sessions: Session[] = []
  let currentSession: Session | null = null
  let firstIn: string | null = null
  let lastOut: string | null = null
  let inCount = 0, outCount = 0, breakStartCount = 0

  live.forEach(ev => {
    if (ev.type === 'in') {
      inCount++
      if (!firstIn) firstIn = ev.time
      currentSession = { in: ev.time, out: null, breaks: [], breakTotal: 0, worked: 0 }
      sessions.push(currentSession)
    } else if (ev.type === 'out') {
      outCount++
      lastOut = ev.time
      if (currentSession) {
        currentSession.out = ev.time
        currentSession = null
      } else {
        sessions.push({ in: null, out: ev.time, breaks: [], breakTotal: 0, worked: 0 })
      }
    } else if (ev.type === 'break_start') {
      breakStartCount++
      if (currentSession) currentSession.breaks.push({ start: ev.time, end: null })
    } else if (ev.type === 'break_end') {
      if (currentSession && currentSession.breaks.length > 0) {
        const lastBreak = currentSession.breaks[currentSession.breaks.length - 1]
        if (!lastBreak.end) lastBreak.end = ev.time
        else currentSession.breaks.push({ start: null, end: ev.time })
      }
    }
  })

  let totalWorked = 0, totalBreak = 0
  sessions.forEach(s => {
    s.breakTotal = s.breaks.reduce((sum, b) => sum + diffMin(b.start, b.end), 0)
    if (s.in && s.out) {
      const span = diffMin(s.in, s.out)
      s.worked = Math.max(0, span - s.breakTotal)
    } else {
      s.worked = 0
    }
    totalWorked += s.worked
    totalBreak += s.breakTotal
  })

  const lastEvent = live[live.length - 1]
  const isWorking = lastEvent.type === 'in' || lastEvent.type === 'break_end'
  const isOnBreak = lastEvent.type === 'break_start'
  const isAfterOut = lastEvent.type === 'out'

  return {
    sessions, firstIn, lastOut,
    totalWorked, totalBreak,
    inCount, outCount, breakCount: breakStartCount,
    isWorking, isOnBreak, isAfterOut,
    eventCount: live.length,
  }
}

/** ボタン有効/無効の判定 */
export interface ActionState {
  enabled: boolean
  reason: string
}

export function getAvailableActions(events: AttendanceEvent[] | undefined | null): Record<AttendanceEventType, ActionState> {
  const live = events ? liveEvents(events) : []
  const lastEvent = live[live.length - 1]
  const lastType = lastEvent ? lastEvent.type : null

  const result: Record<AttendanceEventType, ActionState> = {
    in: { enabled: false, reason: '' },
    break_start: { enabled: false, reason: '' },
    break_end: { enabled: false, reason: '' },
    out: { enabled: false, reason: '' },
  }

  // 出勤
  if (!lastType || lastType === 'out') result.in.enabled = true
  else if (lastType === 'in' || lastType === 'break_end') result.in.reason = '勤務中は不可'
  else if (lastType === 'break_start') result.in.reason = '休憩中は不可'

  // 休憩開始
  if (lastType === 'in' || lastType === 'break_end') result.break_start.enabled = true
  else if (!lastType) result.break_start.reason = '出勤後に可'
  else if (lastType === 'break_start') result.break_start.reason = '休憩中です'
  else if (lastType === 'out') result.break_start.reason = '退勤後は不可'

  // 休憩終了
  if (lastType === 'break_start') result.break_end.enabled = true
  else if (!lastType) result.break_end.reason = '休憩中のみ'
  else if (lastType === 'in' || lastType === 'break_end') result.break_end.reason = '休憩中ではない'
  else if (lastType === 'out') result.break_end.reason = '退勤後は不可'

  // 退勤
  if (lastType === 'in' || lastType === 'break_end') result.out.enabled = true
  else if (!lastType) result.out.reason = '出勤後に可'
  else if (lastType === 'break_start') result.out.reason = '先に休憩終了'
  else if (lastType === 'out') result.out.reason = '退勤済み'

  return result
}

/** LIFOキャンセル: 直前60秒以内の打刻のみ取消可 */
export function cancelLastEvent(
  events: AttendanceEvent[],
  type: AttendanceEventType,
  windowSec: number = 60
): { success: boolean; message: string; events: AttendanceEvent[] } {
  if (!events || events.length === 0) {
    return { success: false, message: '打刻がありません', events: events || [] }
  }

  const live = liveEvents(events)
  if (live.length === 0) {
    return { success: false, message: '有効な打刻がありません', events }
  }

  const lastEvent = live[live.length - 1]
  if (lastEvent.type !== type) {
    return { success: false, message: '先に最新の打刻を取り消してください', events }
  }

  const elapsedSec = (Date.now() - new Date(lastEvent.time).getTime()) / 1000
  if (elapsedSec > windowSec) {
    return { success: false, message: '1分を経過したためキャンセルできません', events }
  }

  // 元配列から対応するイベントを探して論理削除
  const updated = [...events]
  for (let i = updated.length - 1; i >= 0; i--) {
    const ev = updated[i]
    if (ev.type === type && !ev.cancelled && ev.time === lastEvent.time) {
      updated[i] = {
        ...ev,
        cancelled: true,
        cancelledAt: new Date().toISOString(),
      }
      break
    }
  }

  const labels: Record<string, string> = {
    in: '出勤', break_start: '休憩開始', break_end: '休憩終了', out: '退勤',
  }
  return { success: true, message: `${labels[type]}の打刻を取り消しました`, events: updated }
}
