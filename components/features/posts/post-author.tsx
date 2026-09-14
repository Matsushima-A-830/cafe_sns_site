import Image from 'next/image'
import Link from 'next/link'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { formatPostDate } from '@/lib/utils/format-date'
import { safeHttpUrl } from '@/lib/utils/safe-url'

/**
 * 作者とその投稿日。フォローボタンはワイヤーにあるが follows への書き込み導線が
 * 未実装のため今回は出さない（表示専用）
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 */
export function PostAuthor({
  author,
  publishedAt,
}: {
  author: { username: string; displayName: string; avatarUrl: string | null }
  publishedAt: string
}) {
  // avatar_url は profiles に直接書き込める（オンボーディングの Zod は URL 形式しか見ない）。
  // 危険なスキームや第三者ホストを踏ませないよう、本文画像と同じ検証を通す
  const avatarUrl = safeHttpUrl(author.avatarUrl)

  return (
    <div className="flex items-center gap-3">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={40}
          height={40}
          unoptimized={!isStoragePublicUrl(avatarUrl)}
          className="size-10 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-muted text-base text-muted-foreground"
        >
          {author.displayName.slice(0, 1)}
        </span>
      )}

      <div className="flex flex-col">
        {author.username ? (
          <Link
            href={`/users/${author.username}`}
            className="text-base font-bold text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            {author.displayName}
          </Link>
        ) : (
          <span className="text-base font-bold text-foreground">{author.displayName}</span>
        )}
        <time dateTime={publishedAt} className="text-sm text-muted-foreground">
          {formatPostDate(publishedAt)}
        </time>
      </div>
    </div>
  )
}
