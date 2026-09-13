// S_POST_SHORT: 写真＋短文の投稿
// 詳細: docs/design/wireframes/composer.md#s_post_short短文投稿
import { ShortComposer } from '@/components/features/composer/short-composer'
import { loadTagOptions } from '@/lib/composer/tag-options.server'

export default async function NewShortPostPage() {
  const { tags, suggestedTagIds } = await loadTagOptions()

  return <ShortComposer tags={tags} suggestedTagIds={suggestedTagIds} />
}
