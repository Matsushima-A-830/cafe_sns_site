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
  // 真偽値のマウント済みフラグだと、StrictMode の開発時二重実行
  // （mount effect → cleanup → mount effect）で「まだ処理していない tick か」を
  // 見分けられず、2回目の呼び出しで誤って refresh() が走る。処理済みの tick 値そのもの
  // を比較することで、同じ tick に対する再実行は常にスキップする
  const processedTick = useRef(tick)

  useEffect(() => {
    if (tick === processedTick.current) return
    processedTick.current = tick
    routerRef.current.refresh()
  }, [tick])

  return () => setTick((value) => value + 1)
}
