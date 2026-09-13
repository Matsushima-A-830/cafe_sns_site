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
      // tags.category は 'area' も許すが、composer は area タグを描画しない
      // （エリアの正は areas マスタ。pending-items D20）。取得側で明示的に絞り、
      // 将来 area の厳選タグが増えても「取れるのに出ない」状態にしない
      .in('category', ['occasion', 'mood', 'other'])
      .order('priority', { ascending: false })
      .order('slug'),
    user
      ? supabase.from('user_interest_tags').select('tag_id').eq('user_id', user.id)
      : Promise.resolve({ data: [] }),
  ])

  // タグが1件も無い composer は正常な画面と区別が付かないため、原因をサーバーログに残す
  if (tagsResult.error) {
    console.error('[composer] タグ選択肢の取得に失敗:', tagsResult.error.message)
  }

  return {
    tags: (tagsResult.data ?? []) as ComposerTag[],
    suggestedTagIds: (interestsResult.data ?? []).map((row) => row.tag_id as string),
  }
}
