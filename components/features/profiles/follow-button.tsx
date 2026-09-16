'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { followUser, unfollowUser } from '@/app/_actions/follows'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * フォロー / フォロー解除。押した瞬間に見た目を変え、失敗したら戻す（楽観更新）。
 * ヘッダのフォロワー数はサーバーが描いているので、成功後に refresh() で数字を合わせる
 *   docs/design/wireframes/browsing.md #S_USER_PROFILE_PUBLIC
 */
export function FollowButton({
  followeeId,
  initialFollowing,
}: {
  followeeId: string
  initialFollowing: boolean
}) {
  const [following, setFollowing] = useState(initialFollowing)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleClick() {
    // 楽観更新: 失敗時に元に戻すため直前の値を保持
    const previous = following
    setFollowing(!previous)
    setError(null)

    startTransition(async () => {
      const result = previous
        ? await unfollowUser({ followeeId })
        : await followUser({ followeeId })

      // すでにフォロー済みなら、押す前の表示が古かっただけなので成功として扱う
      if (!result.ok && result.error !== 'ALREADY_FOLLOWING') {
        setFollowing(previous)
        setError(errorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={following ? 'outline' : 'default'}
        size="lg"
        onClick={handleClick}
        disabled={isPending}
        className="focus-visible:ring-2 focus-visible:ring-ring-focus"
      >
        {following ? 'フォロー中' : 'フォロー'}
      </Button>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
