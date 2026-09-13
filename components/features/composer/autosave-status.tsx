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

  const stateLabel = (() => {
    if (state === 'saving') return '保存中...'
    if (state === 'error') return '保存できませんでした。通信状況を確認してください'
    if (state === 'saved') return '自動保存済み'
    return '入力すると自動で下書き保存されます'
  })()

  return (
    <p className={state === 'error' ? 'text-sm text-danger' : 'text-sm text-muted-foreground'}>
      {/* 相対時刻は10秒ごとに変わる。aria-live の中に入れると執筆中ずっと読み上げが割り込むため、
          読み上げ対象は状態の文言だけに絞る */}
      <span aria-live="polite">{stateLabel}</span>
      {state === 'saved' && lastSavedAt && <span> ・ {relativeTime(lastSavedAt, now)}</span>}
    </p>
  )
}
