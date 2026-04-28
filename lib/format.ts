const TZ = 'Asia/Tokyo'

/** Date → "YYYY-MM-DD" */
export function fmtDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ })
}

/** Date → "HH:MM:SS" */
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('ja-JP', { timeZone: TZ, hour12: false })
}

/** ISO文字列 → "HH:MM" */
export function fmtTimeShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ja-JP', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' })
}

/** Date → "YYYY年M月D日 (曜)" */
export function fmtDateJa(d: Date): string {
  const dow = dowJa(d)
  const y = d.toLocaleDateString('ja-JP', { timeZone: TZ, year: 'numeric' }).replace('年', '')
  const m = d.toLocaleDateString('ja-JP', { timeZone: TZ, month: 'numeric' }).replace('月', '')
  const day = d.toLocaleDateString('ja-JP', { timeZone: TZ, day: 'numeric' }).replace('日', '')
  return `${y}年${m}月${day}日 (${dow})`
}

/** Date → "YYYY-MM" */
export function fmtMonth(d: Date): string {
  return fmtDate(d).slice(0, 7)
}

/** 曜日の日本語1文字 */
export function dowJa(d: Date): string {
  return ['日', '月', '火', '水', '木', '金', '土'][
    new Date(d.toLocaleDateString('sv-SE', { timeZone: TZ })).getDay()
  ]
}

/** 2つのISO文字列の差分（分） */
export function diffMinutes(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60000
}

/** 分 → "H:MM" (例: 510 → "8:30") */
export function formatMinutes(min: number): string {
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.floor(Math.abs(min) % 60)
  const sign = min < 0 ? '-' : ''
  return `${sign}${h}:${m.toString().padStart(2, '0')}`
}

/** 日本語曜日付き日付 "M/D(曜)" */
export function fmtDateShortJa(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  const m = d.getMonth() + 1
  const day = d.getDate()
  const dow = dowJa(d)
  return `${m}/${day}(${dow})`
}
