// S_POST_ENTRY: 投稿形式の選択シート（+ボタンの遷移先）
// 詳細: docs/design/wireframes/composer.md#エントリ選択ボタン押下時のシート
import { listDrafts } from '@/app/_actions/drafts'
import { EntrySheet } from './entry-sheet'

export default async function NewPostEntryPage() {
  const drafts = await listDrafts()

  return <EntrySheet drafts={drafts.ok ? drafts.data : []} />
}
