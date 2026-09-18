// S_FAVORITES: お気に入りカフェ一覧
// 詳細: docs/design/wireframes/mypage.md#s_favorites--s_want_to_go--s_bookmarks / docs/architecture/routing.md
import type { Metadata } from 'next'
import { CafeListPage } from '@/components/features/cafes/cafe-list-page'

export const metadata: Metadata = { title: 'お気に入りカフェ' }

export default async function FavoritesPage() {
  return <CafeListPage listType="favorite" />
}
