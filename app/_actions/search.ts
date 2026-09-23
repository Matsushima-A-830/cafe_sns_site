'use server'

import { getPostList, type PostListPage } from '@/lib/posts/post-list'
import { resolveSearchOptions } from '@/lib/posts/search'
import { createClient } from '@/lib/supabase/server'
import { loadMoreSearchSchema } from '@/lib/validators/search'
import type { Result } from '@/types/result'

type LoadMoreSearchError = 'INVALID_INPUT' | 'INTERNAL_ERROR'

/**
 * S_SEARCH の「もっと見る」次ページ取得。loadMoreFeed（app/_actions/feed.ts）と同型
 */
export async function loadMoreSearch(
  input: unknown,
): Promise<Result<PostListPage, LoadMoreSearchError>> {
  const parsed = loadMoreSearchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  try {
    const resolved = await resolveSearchOptions(supabase, parsed.data.query, user?.id ?? null)
    if (!resolved) return { ok: true, data: { items: [], nextCursor: null } }

    const page = await getPostList(supabase, { ...resolved.options, cursor: parsed.data.cursor })
    return { ok: true, data: page }
  } catch (cause) {
    console.error('[search] 次ページの取得に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}
