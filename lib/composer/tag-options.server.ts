import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { ComposerTag } from '@/types/composer'

/**
 * composer のタグ欄に渡す選択肢。厳選タグ（is_curated）だけを出し、
 * おすすめ枠にはオンボーディングで選んだ気分タグ（user_interest_tags）を回す
 *   docs/seed/curated-tags-initial-set.md
 */
export async function loadTagOptions(): Promise<{
  tags: ComposerTag[]
  suggestedTagIds: string[]
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [tagsResult, interestsResult] = await Promise.all([
    supabase
      .from('tags')
      .select('id, label, category')
      .eq('is_curated', true)
      .order('priority', { ascending: false })
      .order('slug'),
    user
      ? supabase.from('user_interest_tags').select('tag_id').eq('user_id', user.id)
      : Promise.resolve({ data: [] }),
  ])

  return {
    tags: (tagsResult.data ?? []) as ComposerTag[],
    suggestedTagIds: (interestsResult.data ?? []).map((row) => row.tag_id as string),
  }
}
