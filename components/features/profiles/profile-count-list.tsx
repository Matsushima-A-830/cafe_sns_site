import type { ProfileCounts } from '@/lib/profiles/public-profile'

/** 「投稿 42 · フォロー 128 · フォロワー 89」（S_USER_PROFILE_PUBLIC / S_MYPAGE 共通） */
export function ProfileCountList({ counts }: { counts: ProfileCounts }) {
  const items = [
    { label: '投稿', value: counts.posts },
    { label: 'フォロー', value: counts.following },
    { label: 'フォロワー', value: counts.followers },
  ]

  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-base text-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
