'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminSelect } from '@/lib/api'
import { getCached, setCached } from '@/lib/cache'
import type { AuditLog } from '@/types/db'

const CK = 'admin-audit:'

const ACTION_LABEL: Record<string, string> = {
  insert: '作成', update: '更新', delete: '削除', login: 'ログイン',
  approve: '承認', reject: '却下', withdraw: '取消',
}

export default function AdminAuditPage() {
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterTarget, setFilterTarget] = useState('')
  const [logs, setLogs] = useState<AuditLog[]>(
    () => getCached<AuditLog[]>(CK + 'logs::::') ?? []
  )
  const [loading, setLoading] = useState<boolean>(
    () => !getCached<AuditLog[]>(CK + 'logs::::')
  )

  const load = useCallback(async () => {
    const cacheKey = `${CK}logs:${filterFrom}:${filterTo}:${filterAction}:${filterTarget}`
    const cached = getCached<AuditLog[]>(cacheKey)
    if (cached) {
      setLogs(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    const filters: Record<string, string> = {}
    if (filterAction) filters.action = filterAction
    if (filterTarget) filters.target_type = filterTarget
    const { data } = await adminSelect<AuditLog[]>({
      table: 'audit_log',
      filters,
      gte: filterFrom ? { column: 'created_at', value: `${filterFrom}T00:00:00+09:00` } : undefined,
      lte: filterTo ? { column: 'created_at', value: `${filterTo}T23:59:59+09:00` } : undefined,
      order: { column: 'created_at', ascending: false },
      limit: 500,
    })
    const list = data || []
    setLogs(list)
    setCached(cacheKey, list)
    setLoading(false)
  }, [filterFrom, filterTo, filterAction, filterTarget])

  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    const header = ['日時', 'アクター種別', 'アクターID', 'アクション', '対象種別', '対象ID', 'IP', 'UA']
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString('ja-JP'),
      l.actor_type, l.actor_id || '',
      l.action, l.target_type || '', l.target_id || '',
      l.ip_address || '', l.user_agent || '',
    ])
    const csv = [header, ...rows].map(row =>
      row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
                <span className="lbl-ja">アクション</span>
                <span className="lbl-en">ACTION</span>
              </label>
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="">全て</option>
                {Object.entries(ACTION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>
                <span className="lbl-ja">対象</span>
                <span className="lbl-en">TARGET</span>
              </label>
              <select value={filterTarget} onChange={e => setFilterTarget(e.target.value)}>
                <option value="">全て</option>
                <option value="employees">employees</option>
                <option value="attendance">attendance</option>
                <option value="correction_requests">correction_requests</option>
                <option value="settings">settings</option>
              </select>
            </div>
            <div className="spacer"></div>
            <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={logs.length === 0}>
              <svg className="icon-svg-sm"><use href="#i-download" /></svg>
              CSV出力
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
          <div className="table-wrap">
            {loading ? (
              <div className="empty-state">読み込み中...</div>
            ) : logs.length === 0 ? (
              <div className="empty-state">
                <svg className="icon-svg-lg empty-state-icon"><use href="#i-list" /></svg>
                <div>該当するログはありません</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>アクター</th>
                    <th>アクション</th>
                    <th>対象</th>
                    <th>対象ID</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td className="cell-mono">{new Date(l.created_at).toLocaleString('ja-JP')}</td>
                      <td>
                        <span className="badge badge-info">{l.actor_type}</span>
                        {l.actor_id && <span className="cell-mono" style={{ marginLeft: 6 }}>{l.actor_id}</span>}
                      </td>
                      <td>{ACTION_LABEL[l.action] || l.action}</td>
                      <td className="cell-mono">{l.target_type || '-'}</td>
                      <td className="cell-mono">{l.target_id || '-'}</td>
                      <td className="cell-mono" style={{ fontSize: 11 }}>{l.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
