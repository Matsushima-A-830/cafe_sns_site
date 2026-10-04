'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * startTransition の外で router.refresh() を呼ぶためのフック（D37）。
 * startTransition の中で呼ぶと refresh() がトランジションに参加し、isPending が
 * RSC の往復完了まで真のままになる。戻り値の関数でマークし、コミット後の
 * useEffect（＝トランジションの外）から refresh() する
 */
export function useDeferredRefresh() {
  const router = useRouter()
  // router参照がレンダーごとに変わっても誤発火しないよう、依存配列には載せない
  const routerRef = useRef(router)
  routerRef.current = router
  const [tick, setTick] = useState(0)
  const mounted = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick は発火トリガーのみ、routerRef 経由で読むため依存に router は不要
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    routerRef.current.refresh()
  }, [tick])

  return () => setTick((value) => value + 1)
}
