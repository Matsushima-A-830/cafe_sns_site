import Image from 'next/image'
import { isStoragePublicUrl } from '@/lib/storage/public-url'

/**
 * プロフィールのアバター（S_USER_PROFILE_PUBLIC / S_MYPAGE）。
 *
 * 表示前に必ず isStoragePublicUrl を通す。avatar_url は API 直叩きで書き換えられる
 * （オンボーディングの Zod は URL 形式しか見ない）ため、外部ホストを許すと
 * プロフィールを開いた全員のIP・UA・Referer が第三者に渡る。
 * この判定を画面ごとにコピーすると片方で抜けるので1箇所に閉じる
 */
const SIZE = 96

export function ProfileAvatar({
  avatarUrl,
  displayName,
  priority = false,
}: {
  avatarUrl: string | null
  displayName: string
  priority?: boolean
}) {
  const url = avatarUrl && isStoragePublicUrl(avatarUrl) ? avatarUrl : null

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="flex size-24 shrink-0 items-center justify-center rounded-full bg-muted text-3xl text-muted-foreground"
      >
        {displayName.slice(0, 1)}
      </span>
    )
  }

  return (
    <Image
      src={url}
      alt=""
      width={SIZE}
      height={SIZE}
      priority={priority}
      className="size-24 shrink-0 rounded-full object-cover"
    />
  )
}
