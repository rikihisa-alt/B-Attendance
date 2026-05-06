'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { adminSelect } from '@/lib/api'
import { getCached, setCached } from '@/lib/cache'
import type { AuditLog } from '@/types/db'

const CK = 'admin-audit:'

const ACTION_LABEL: Record<string, string> = {
  // 認証
  login: 'ログイン',
  login_failed: 'ログイン失敗',
  logout: 'ログアウト',
  change_password: 'パスワード変更',
  reset_password: 'パスワードリセット',
  change_admin_password: '管理者PW変更',
  // 打刻
  clock_in: '出勤打刻',
  clock_out: '退勤打刻',
  break_start: '休憩開始',
  break_end: '休憩終了',
  clock_cancel: '打刻取消',
  // 勤怠編集
  attendance_edit: '勤怠編集',
  admin_note_update: '管理メモ更新',
  // 修正申請
  submit_correction: '修正申請',
  withdraw_correction: '申請取下げ',
  approve_correction: '申請承認',
  reject_correction: '申請却下',
  // 従業員管理
  employee_create: '従業員追加',
  employee_update: '従業員更新',
  employee_inactivate: '退職処理',
  employee_id_change: '社員ID変更',
  // 設定
  settings_update: '設定変更',
  // 旧来
  insert: '作成', update: '更新', delete: '削除',
  approve: '承認', reject: '却下', withdraw: '取消',
}

// アクションをカテゴリ分け（タイムラインの色分け）
const ACTION_CATEGORY: Record<string, 'auth' | 'clock' | 'edit' | 'request' | 'admin' | 'fail'> = {
  login: 'auth', logout: 'auth', change_password: 'auth', reset_password: 'auth', change_admin_password: 'auth',
  login_failed: 'fail',
  clock_in: 'clock', clock_out: 'clock', break_start: 'clock', break_end: 'clock', clock_cancel: 'clock',
  attendance_edit: 'edit', admin_note_update: 'edit',
  submit_correction: 'request', withdraw_correction: 'request',
  approve_correction: 'admin', reject_correction: 'admin',
  employee_create: 'admin', employee_update: 'admin', employee_inactivate: 'admin', employee_id_change: 'admin',
  settings_update: 'admin',
}

const CATEGORY_COLOR: Record<string, string> = {
  auth: 'var(--primary)',
  clock: 'var(--orange)',
  edit: 'var(--purple)',
  request: 'var(--teal)',
  admin: 'var(--green)',
  fail: 'var(--red)',
}

type ViewMode = 'timeline' | 'table'

function fmtJpDateTime(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

function fmtJpDate(iso: string) {
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function AdminAuditPage() {
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterActor, setFilterActor] = useState('')
  const [filterActorType, setFilterActorType] = useState('')
  const [view, setView] = useState<ViewMode>('timeline')
  const [logs, setLogs] = useState<AuditLog[]>(
    () => getCached<AuditLog[]>(CK + 'logs:::::') ?? []
  )
  const [loading, setLoading] = useState<boolean>(
    () => !getCached<AuditLog[]>(CK + 'logs:::::')
  )

  const load = useCallback(async () => {
    const cacheKey = `${CK}logs:${filterFrom}:${filterTo}:${filterAction}:${filterActor}:${filterActorType}`
    const cached = getCached<AuditLog[]>(cacheKey)
    if (cached) {
      setLogs(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    const filters: Record<string, string> = {}
    if (filterAction) filters.action = filterAction
    if (filterActorType) filters.actor_type = filterActorType
    if (filterActor) filters.actor_id = filterActor
    const { data } = await adminSelect<AuditLog[]>({
      table: 'audit_log',
      filters,
      gte: filterFrom ? { column: 'created_at', value: `${filterFrom}T00:00:00+09:00` } : undefined,
      lte: filterTo ? { column: 'created_at', value: `${filterTo}T23:59:59+09:00` } : undefined,
      order: { column: 'created_at', ascending: false },
      limit: 1000,
    })
    const list = data || []
    setLogs(list)
    setCached(cacheKey, list)
    setLoading(false)
  }, [filterFrom, filterTo, filterAction, filterActor, filterActorType])

  useEffect(() => { load() }, [load])

  // タイムライン表示用に「日付ごと」にグルーピング
  const grouped = useMemo(() => {
    const map = new Map<string, AuditLog[]>()
    for (const l of logs) {
      const key = new Date(l.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    return Array.from(map.entries())
  }, [logs])

  const exportCsv = () => {
    const header = ['日時', 'アクター種別', 'アクターID', 'アクション', '対象種別', '対象ID', 'IP', 'UA', 'before', 'after']
    const rows = logs.map(l => [
      fmtJpDateTime(l.created_at),
      l.actor_type, l.actor_id || '',
      ACTION_LABEL[l.action] || l.action, l.target_type || '', l.target_id || '',
      l.ip_address || '', l.user_agent || '',
      l.before_data ? JSON.stringify(l.before_data) : '',
      l.after_data ? JSON.stringify(l.after_data) : '',
    ])
    const csv = [header, ...rows].map(row =>
      row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderActionBadge = (action: string) => {
    const cat = ACTION_CATEGORY[action] || 'admin'
    const color = CATEGORY_COLOR[cat]
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 10,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
        color: 'white', background: color,
      }}>
        {ACTION_LABEL[action] || action}
      </span>
    )
  }

  const renderActorBadge = (l: AuditLog) => {
    const isAdmin = l.actor_type === 'admin'
    const color = isAdmin ? 'var(--primary)' : 'var(--text-soft)'
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, color,
      }}>
        <span style={{ fontWeight: 700 }}>{l.actor_type}</span>
        {l.actor_id && <span className="cell-mono">{l.actor_id}</span>}
      </span>
    )
  }

  const renderDataDetails = (l: AuditLog) => {
    const before = l.before_data
    const after = l.after_data
    if (!before && !after) return null
    return (
      <details style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
        <summary style={{ cursor: 'pointer' }}>詳細</summary>
        <pre style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          background: 'var(--bg-soft)', padding: 6, borderRadius: 4,
          marginTop: 4, overflow: 'auto', maxHeight: 200,
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {after ? `after: ${JSON.stringify(after, null, 2)}\n` : ''}
          {before ? `before: ${JSON.stringify(before, null, 2)}` : ''}
        </pre>
      </details>
    )
  }

  return (
    <section className="page">
      <div className="page-header">
        <div className="page-title-block">
          <span className="page-title">ログ閲覧</span>
          <span className="page-title-en">AUDIT LOG</span>
        </div>
        <div className="page-greeting">
          <div className="greeting-text">
            <span className="name">管理者</span>さん、お疲れ様です。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">フィルター</span>
            <span className="card-title-en">FILTER</span>
          </div>
        </div>
        <div className="card-body">
          <div className="toolbar">
            <div className="field" style={{ margin: 0 }}>
              <label>
                <span className="lbl-ja">開始日</span>
                <span className="lbl-en">FROM</span>
              </label>
              <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                <span className="lbl-ja">終了日</span>
                <span className="lbl-en">TO</span>
              </label>
              <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                <span className="lbl-ja">種別</span>
                <span className="lbl-en">ACTOR</span>
              </label>
              <select value={filterActorType} onChange={e => setFilterActorType(e.target.value)}>
                <option value="">全て</option>
                <option value="admin">管理者</option>
                <option value="user">一般</option>
                <option value="system">システム</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                <span className="lbl-ja">アクション</span>
                <span className="lbl-en">ACTION</span>
              </label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="">全て</option>
                <optgroup label="認証">
                  <option value="login">ログイン</option>
                  <option value="login_failed">ログイン失敗</option>
                  <option value="logout">ログアウト</option>
                  <option value="change_password">パスワード変更</option>
                  <option value="reset_password">パスワードリセット</option>
                  <option value="change_admin_password">管理者PW変更</option>
                </optgroup>
                <optgroup label="打刻">
                  <option value="clock_in">出勤打刻</option>
                  <option value="clock_out">退勤打刻</option>
                  <option value="break_start">休憩開始</option>
                  <option value="break_end">休憩終了</option>
                  <option value="clock_cancel">打刻取消</option>
                </optgroup>
                <optgroup label="編集">
                  <option value="attendance_edit">勤怠編集</option>
                  <option value="admin_note_update">管理メモ更新</option>
                </optgroup>
                <optgroup label="修正申請">
                  <option value="submit_correction">修正申請</option>
                  <option value="withdraw_correction">申請取下げ</option>
                  <option value="approve_correction">申請承認</option>
                  <option value="reject_correction">申請却下</option>
                </optgroup>
                <optgroup label="管理">
                  <option value="employee_create">従業員追加</option>
                  <option value="employee_update">従業員更新</option>
                  <option value="employee_inactivate">退職処理</option>
                  <option value="employee_id_change">社員ID変更</option>
                  <option value="settings_update">設定変更</option>
                </optgroup>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                <span className="lbl-ja">アクターID</span>
                <span className="lbl-en">ID</span>
              </label>
              <input type="text" value={filterActor} onChange={e => setFilterActor(e.target.value)} placeholder="社員ID等" />
            </div>
            <div className="spacer"></div>
            <button
              className={`btn btn-sm${view === 'timeline' ? ' btn-primary' : ''}`}
              onClick={() => setView('timeline')}
            >タイムライン</button>
            <button
              className={`btn btn-sm${view === 'table' ? ' btn-primary' : ''}`}
              onClick={() => setView('table')}
            >表</button>
            <button className="btn btn-sm" onClick={exportCsv} disabled={logs.length === 0}>
              <svg className="icon-svg-sm"><use href="#i-download" /></svg>
              CSV
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <span className="card-title">監査ログ ({logs.length}件)</span>
            <span className="card-title-en">RECORDS</span>
          </div>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <svg className="icon-svg-lg empty-state-icon"><use href="#i-list" /></svg>
              <div>該当するログはありません</div>
            </div>
          ) : view === 'timeline' ? (
            <div className="audit-timeline">
              {grouped.map(([date, dayLogs]) => (
                <div key={date} className="audit-day">
                  <div className="audit-day-header">
                    <span className="audit-day-date cell-mono">{date}</span>
                    <span className="audit-day-meta">{fmtJpDate(date)} ({dayLogs.length}件)</span>
                  </div>
                  <ol className="audit-day-events">
                    {dayLogs.map(l => {
                      const cat = ACTION_CATEGORY[l.action] || 'admin'
                      const color = CATEGORY_COLOR[cat]
                      return (
                        <li key={l.id} className="audit-event" style={{ borderLeftColor: color }}>
                          <span className="audit-event-time cell-mono">{fmtTime(l.created_at)}</span>
                          <div className="audit-event-body">
                            <div className="audit-event-head">
                              {renderActionBadge(l.action)}
                              {renderActorBadge(l)}
                              {l.target_type && (
                                <span className="audit-event-target cell-mono">
                                  → {l.target_type}{l.target_id ? `:${l.target_id}` : ''}
                                </span>
                              )}
                            </div>
                            {renderDataDetails(l)}
                          </div>
                          {l.ip_address && (
                            <span className="audit-event-ip cell-mono">{l.ip_address}</span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>アクター</th>
                    <th>アクション</th>
                    <th>対象</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td className="cell-mono">{fmtJpDateTime(l.created_at)}</td>
                      <td>{renderActorBadge(l)}</td>
                      <td>
                        {renderActionBadge(l.action)}
                        {renderDataDetails(l)}
                      </td>
                      <td className="cell-mono">
                        {l.target_type || '-'}{l.target_id ? `:${l.target_id}` : ''}
                      </td>
                      <td className="cell-mono" style={{ fontSize: 11 }}>{l.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
