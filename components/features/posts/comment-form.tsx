'use client'

import Link from 'next/link'
import { type FormEvent, useId, useState, useTransition } from 'react'
import { createComment } from '@/app/_actions/comments'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Textarea } from '@/components/ui/textarea'
import type { CommentAuthor, CommentReply } from '@/lib/posts/comments'
import { errorMessage } from '@/lib/utils/error-messages'
import { COMMENT_BODY_MAX_CHARS } from '@/lib/validators/comments'

/**
 * コメント・返信の投稿フォーム。S_POST_DETAIL のコメント欄本体（新規投稿）と、
 * 各コメントの「返信」展開の両方から使う（parentId の有無で出し分け）
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 *
 * createComment は commentId と確定件数しか返さない（本文はここが既に持っている）ため、
 * 新規コメントの表示情報は呼び出し元から渡された viewer（自分自身のプロフィール）で
 * 補う。router.refresh() には頼らない — D37（refresh を startTransition の中で呼ぶと
 * isPending が RSC の往復のあいだ真のままになる）を再現しないため
 */
export function CommentForm({
  postId,
  parentId,
  viewer,
  isAuthenticated,
  returnTo,
  placeholder = 'コメントを書く',
  submitLabel = 'コメントする',
  autoFocus = false,
  onCreated,
  onCancel,
}: {
  postId: string
  parentId?: string
  /** 自分自身の表示情報。取得できていない場合は null（本文は表示できるが名前は仮になる） */
  viewer: CommentAuthor | null
  isAuthenticated: boolean
  returnTo: string
  placeholder?: string
  submitLabel?: string
  autoFocus?: boolean
  onCreated: (comment: CommentReply, commentCount: number) => void
  onCancel?: () => void
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaId = useId()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // disabled にせず自前で弾く（LikeButton と同じ理由 — D33）
    if (isPending) return

    const trimmed = body.trim()
    if (trimmed.length === 0) {
      setError(errorMessage('POST_BODY_EMPTY'))
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await createComment({ postId, parentId, body: trimmed })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }

      const now = new Date().toISOString()
      onCreated(
        {
          id: result.data.commentId,
          body: trimmed,
          isOfficial: false,
          createdAt: now,
          updatedAt: now,
          author: viewer ?? { id: '', username: '', displayName: '自分', avatarUrl: null },
        },
        result.data.commentCount,
      )
      setBody('')
      onCancel?.()
    })
  }

  if (!isAuthenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?next=${encodeURIComponent(returnTo)}`}
          className="text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          ログイン
        </Link>
        すると{parentId ? '返信' : 'コメント'}できます。
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={textareaId} className="sr-only">
        {placeholder}
      </label>
      <Textarea
        id={textareaId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        maxLength={COMMENT_BODY_MAX_CHARS}
        rows={parentId ? 2 : 3}
        autoFocus={autoFocus}
        aria-invalid={error !== null}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {body.length}/{COMMENT_BODY_MAX_CHARS}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              キャンセル
            </Button>
          )}
          <Button type="submit" size="sm" aria-busy={isPending}>
            {isPending ? '送信中…' : submitLabel}
          </Button>
        </div>
      </div>
      <FieldError>{error ?? undefined}</FieldError>
    </form>
  )
}
