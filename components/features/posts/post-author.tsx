import Image from 'next/image'
import Link from 'next/link'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { formatPostDate } from '@/lib/utils/format-date'

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
  // 本文画像と同じく自前の Storage のものだけを出す。外部ホストを許すと、投稿を開いた
  // 全員のIP・UA・Referer がその host に渡る
  const avatarUrl =
    author.avatarUrl && isStoragePublicUrl(author.avatarUrl) ? author.avatarUrl : null

  return (
    <div className="flex items-center gap-3">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          width={40}
          height={40}
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
