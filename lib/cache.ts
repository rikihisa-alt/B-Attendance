'use client'

// 画面間移動時にデータが空からフェッチされる「ラグ」を消すための簡易キャッシュ。
// stale-while-revalidate: 戻ってきた時にキャッシュを即時表示し、裏で再取得して更新する。

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

const memCache = new Map<string, unknown>()

export function getCached<T>(key: string): T | undefined {
  return memCache.has(key) ? (memCache.get(key) as T) : undefined
}

export function hasCached(key: string): boolean {
  return memCache.has(key)
}

export function setCached<T>(key: string, value: T): void {
  memCache.set(key, value)
}

export function clearCache(prefix?: string): void {
  if (!prefix) {
    memCache.clear()
    return
  }
  const keys: string[] = []
  memCache.forEach((_, k) => keys.push(k))
  for (const k of keys) {
    if (k.startsWith(prefix)) memCache.delete(k)
  }
}

export function useCachedState<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    return memCache.has(key) ? (memCache.get(key) as T) : initial
  })
  const setter: Dispatch<SetStateAction<T>> = useCallback(
    (value) => {
      setState((prev) => {
        const next =
          typeof value === 'function'
            ? (value as (p: T) => T)(prev)
            : value
        memCache.set(key, next)
        return next
      })
    },
    [key],
  )
  return [state, setter]
}
