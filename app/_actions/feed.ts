'use server'

import { resolveFeedOptions } from '@/lib/posts/feed'
import { getPostList, type PostListPage } from '@/lib/posts/post-list'
import { createClient } from '@/lib/supabase/server'
import { loadMoreFeedSchema } from '@/lib/validators/feed'
import type { Result } from '@/types/result'

type LoadMoreFeedError = 'INVALID_INPUT' | 'INTERNAL_ERROR'

/**
 * 「もっと見る」の次ページ取得。読み取りだが、Route Handler を足さずに済むので
 * Server Action にする（routing.md「Server Actions で代替できないものだけを Route Handlers で」）。
 *
 * 認可は RLS に委譲する。scope='following' のフォロー元と scope='recommended' の
 * 興味タグはクライアントの入力ではなくセッションから引く（他人のフィードを覗けないように）
 */
export async function loadMoreFeed(
  input: unknown,
): Promise<Result<PostListPage, LoadMoreFeedError>> {
  const parsed = loadMoreFeedSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  try {
    const resolved = await resolveFeedOptions(supabase, parsed.data.query, user?.id ?? null)
    if (!resolved) return { ok: true, data: { items: [], nextCursor: null } }

    const page = await getPostList(supabase, { ...resolved.options, cursor: parsed.data.cursor })
    return { ok: true, data: page }
  } catch (cause) {
    console.error('[feed] 次ページの取得に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}
