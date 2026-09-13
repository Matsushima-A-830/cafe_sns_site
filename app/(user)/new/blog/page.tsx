// S_POST_BLOG: タイトル + Tiptap本文のブログ投稿
// 詳細: docs/design/wireframes/composer.md#s_post_blogブログ投稿
import { BlogComposer } from '@/components/features/composer/blog-composer'
import { loadTagOptions } from '@/lib/composer/tag-options.server'

export default async function NewBlogPostPage() {
  const { tags, suggestedTagIds } = await loadTagOptions()

  return <BlogComposer tags={tags} suggestedTagIds={suggestedTagIds} />
}
