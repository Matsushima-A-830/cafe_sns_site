// S_WANT_TO_GO: 行きたいカフェ一覧
// 詳細: docs/design/wireframes/mypage.md#s_favorites--s_want_to_go--s_bookmarks / docs/architecture/routing.md
import type { Metadata } from 'next'
import { CafeListPage } from '@/components/features/cafes/cafe-list-page'

export const metadata: Metadata = { title: '行きたいカフェ' }

export default async function WantToGoPage() {
  return <CafeListPage listType="want_to_go" />
}
