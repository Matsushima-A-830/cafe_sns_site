'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { reserveOfficialPost } from '@/app/_actions/posts-official'
import type { OfficialFormat } from '@/lib/constants/posts'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * S_POST_OFFICIAL の4フォーム共通の予約フック。ImagePicker / TiptapEditor は
 * is_post_author(postId) を要求するため、フォーム表示と同時に hidden 予約行を作る
 * — reservePost（一般投稿の useComposer）と同じ理由。
 *
 * useComposer をそのまま流用しない理由: 下書き自動保存（15秒デバウンス）は
 * 構造化フォーマット（今日のおすすめ/新メニュー/臨時休業）に何を積むか未定義で、
 * ワイヤーにも下書き保存の記載が無い。4フォーマット共通の「予約→送信」部分だけを
 * 切り出した軽量フックにする
 *   docs/design/wireframes/composer.md #S_POST_OFFICIAL
 */
export function useOfficialComposer(officialFormat: OfficialFormat) {
  const router = useRouter()
  const [postId, setPostId] = useState<string | null>(null)
  const [cafeName, setCafeName] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [formError, setFormError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  // StrictMode の開発時二重実行で予約が2回走らないようにする。この ref だけで
  // 十分なので、cleanup で立てる cancelled フラグは持たない — 二重実行の1回目の
  // cleanup が「2回目以降も使う」共有の cancelled を true にしてしまうと、
  // 実際に発火した唯一のリクエストの結果まで捨てられて永久に読み込み中のままになる
  const reserved = useRef(false)

  useEffect(() => {
    if (reserved.current) return
    reserved.current = true

    reserveOfficialPost({ officialFormat }).then((result) => {
      if (!result.ok) {
        setFormError(errorMessage(result.error))
        setStatus('error')
        return
      }
      setPostId(result.data.postId)
      setCafeName(result.data.cafeName)
      setStatus('ready')
    })
  }, [officialFormat])

  /** 送信結果が ok なら /new/success へ遷移する。呼び出し側は結果の分岐だけ書けばよい */
  async function submit<T>(
    action: () => Promise<{ ok: true; data: { postId: string } } | { ok: false; error: T }>,
  ) {
    setIsSubmitting(true)
    setFormError(undefined)
    const result = await action()
    setIsSubmitting(false)
    if (!result.ok) {
      setFormError(errorMessage(result.error as Parameters<typeof errorMessage>[0]))
      return false
    }
    router.replace(`/new/success?postId=${result.data.postId}`)
    return true
  }

  return { postId, cafeName, status, formError, setFormError, isSubmitting, submit }
}
