'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { deleteComment, loadMoreComments } from '@/app/_actions/comments'
import { CommentForm } from '@/components/features/posts/comment-form'
import { Button } from '@/components/ui/button'
import type {
  CommentAuthor,
  CommentItem,
  CommentListCursor,
  CommentReply,
} from '@/lib/posts/comments'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'
import { formatPostDate } from '@/lib/utils/format-date'

/**
 * コメントスレッド本体（S_POST_DETAIL）。新規投稿フォーム・一覧（返信は1階層のみ、
 * 親の下に常に全件表示）・「もっと見る」・返信/削除を1つにまとめる。
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 *   docs/architecture/data-model/tables.md #comments
 *
 * 新規コメントは createComment 成功後にその場で追記する（LikeButton のような
 * 「先に楽観更新してから確定値で上書き」ではなく、確定を待ってから1回だけ足す —
 * 一時IDの付け替えが要らず、D37 の refresh 依存も避けられる）
 */
export function CommentList({
  postId,
  initialItems,
  initialCursor,
  initialCount,
  isAuthenticated,
  /** 投稿主本人か。true なら他人のコメントも論理削除できる（モデレーション） */
  canModerate,
  viewer,
  returnTo,
}: {
  postId: string
  initialItems: CommentItem[]
  initialCursor: CommentListCursor | null
  initialCount: number
  isAuthenticated: boolean
  canModerate: boolean
  viewer: CommentAuthor | null
  returnTo: string
}) {
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [count, setCount] = useState(initialCount)
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleTopLevelCreated(comment: CommentReply, commentCount: number) {
    setItems((current) => [...current, { ...comment, replies: [] }])
    setCount(commentCount)
  }

  function handleReplyCreated(parentId: string, reply: CommentReply, commentCount: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === parentId ? { ...item, replies: [...item.replies, reply] } : item,
      ),
    )
    setCount(commentCount)
    setReplyTargetId(null)
  }

  function handleDelete(commentId: string, parentId: string | null) {
    const previousItems = items
    const previousCount = count
    setItems((current) =>
      parentId === null
        ? current.filter((item) => item.id !== commentId)
        : current.map((item) =>
            item.id === parentId
              ? { ...item, replies: item.replies.filter((reply) => reply.id !== commentId) }
              : item,
          ),
    )
    setCount((n) => Math.max(n - 1, 0))
    setConfirmingDeleteId(null)
    setError(null)

    startTransition(async () => {
      const result = await deleteComment({ commentId, postId })
      if (!result.ok) {
        setItems(previousItems)
        setCount(previousCount)
        setError(errorMessage(result.error))
        return
      }
      setCount(result.data.commentCount)
    })
  }

  function handleLoadMore() {
    if (!cursor) return
    setError(null)
    startTransition(async () => {
      const result = await loadMoreComments({ postId, cursor })
      if (!result.ok) {
        setError(errorMessage(result.error))
        return
      }
      setItems((current) => [...current, ...result.data.items])
      setCursor(result.data.nextCursor)
    })
  }

  function canDelete(author: CommentAuthor): boolean {
    return canModerate || (viewer !== null && viewer.id === author.id)
  }

  return (
    <section id="comments" className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">コメント {count}件</h2>

      <CommentForm
        postId={postId}
        viewer={viewer}
        isAuthenticated={isAuthenticated}
        returnTo={returnTo}
        onCreated={handleTopLevelCreated}
      />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだコメントがありません。</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2">
              <CommentEntry
                comment={item}
                canReply={isAuthenticated}
                canDelete={canDelete(item.author)}
                isConfirmingDelete={confirmingDeleteId === item.id}
                onReply={() =>
                  setReplyTargetId((current) => (current === item.id ? null : item.id))
                }
                onRequestDelete={() => setConfirmingDeleteId(item.id)}
                onCancelDelete={() => setConfirmingDeleteId(null)}
                onConfirmDelete={() => handleDelete(item.id, null)}
              />

              {item.replies.length > 0 && (
                <ul className="ml-8 flex flex-col gap-3 border-l border-border-default pl-4">
                  {item.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentEntry
                        comment={reply}
                        canReply={false}
                        canDelete={canDelete(reply.author)}
                        isConfirmingDelete={confirmingDeleteId === reply.id}
                        onReply={() => {}}
                        onRequestDelete={() => setConfirmingDeleteId(reply.id)}
                        onCancelDelete={() => setConfirmingDeleteId(null)}
                        onConfirmDelete={() => handleDelete(reply.id, item.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {replyTargetId === item.id && (
                <div className="ml-8">
                  <CommentForm
                    postId={postId}
                    parentId={item.id}
                    viewer={viewer}
                    isAuthenticated={isAuthenticated}
                    returnTo={returnTo}
                    placeholder="返信を書く"
                    submitLabel="返信する"
                    autoFocus
                    onCreated={(reply, commentCount) =>
                      handleReplyCreated(item.id, reply, commentCount)
                    }
                    onCancel={() => setReplyTargetId(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {isPending ? '処理中' : `コメント${count}件`}
      </p>

      {cursor && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={handleLoadMore} disabled={isPending}>
            {isPending ? '読み込み中…' : 'もっと見る'}
          </Button>
        </div>
      )}
    </section>
  )
}

/** 1件のコメント/返信の表示。作者・本文・操作（返信/削除）をまとめる */
function CommentEntry({
  comment,
  canReply,
  canDelete,
  isConfirmingDelete,
  onReply,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  comment: CommentReply
  canReply: boolean
  canDelete: boolean
  isConfirmingDelete: boolean
  onReply: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const avatarUrl =
    comment.author.avatarUrl && isStoragePublicUrl(comment.author.avatarUrl)
      ? comment.author.avatarUrl
      : null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground"
          >
            {comment.author.displayName.slice(0, 1)}
          </span>
        )}

        {comment.author.username ? (
          <Link
            href={`/users/${comment.author.username}`}
            className="text-sm font-bold text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            {comment.author.displayName}
          </Link>
        ) : (
          <span className="text-sm font-bold text-foreground">{comment.author.displayName}</span>
        )}

        {/* 色だけで区別しない。バッジ内にラベルの文字を必ず入れる */}
        {comment.isOfficial && (
          <span className="rounded-full bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">
            オーナー公式
          </span>
        )}

        <time dateTime={comment.createdAt} className="ml-auto text-xs text-muted-foreground">
          {formatPostDate(comment.createdAt)}
        </time>
      </div>

      <p className="text-base whitespace-pre-wrap text-foreground">{comment.body}</p>

      <div className="flex flex-wrap items-center gap-4">
        {canReply && (
          <button
            type="button"
            onClick={onReply}
            className="text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            返信
          </button>
        )}

        {canDelete && !isConfirmingDelete && (
          <button
            type="button"
            onClick={onRequestDelete}
            className="text-sm text-muted-foreground hover:text-danger focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            削除
          </button>
        )}

        {canDelete && isConfirmingDelete && (
          <span className={cn('flex items-center gap-2 text-sm text-foreground')}>
            本当に削除しますか？
            <button
              type="button"
              onClick={onConfirmDelete}
              className="font-bold text-danger underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              やめる
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
