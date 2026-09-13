'use client'

import { useEffect, useState } from 'react'
import type { AutosaveState } from '@/types/composer'

/** 「保存されている」ことが伝わらないと離脱時の不安が残る（損失回避の可視化） */
function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}秒前`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分前`
  return `${Math.round(minutes / 60)}時間前`
}

export function AutosaveStatus({
  state,
  lastSavedAt,
}: {
  state: AutosaveState
  lastSavedAt?: string
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!lastSavedAt) return
    const timer = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(timer)
  }, [lastSavedAt])

  const label = (() => {
    if (state === 'saving') return '保存中...'
    if (state === 'error') return '保存できませんでした。通信状況を確認してください'
    if (state === 'saved' && lastSavedAt) return `自動保存済み ・ ${relativeTime(lastSavedAt, now)}`
    return '入力すると自動で下書き保存されます'
  })()

  return (
    <p
      aria-live="polite"
      className={state === 'error' ? 'text-sm text-danger' : 'text-sm text-muted-foreground'}
    >
      {label}
    </p>
  )
}
