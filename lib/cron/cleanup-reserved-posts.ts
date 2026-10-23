import type { SupabaseClient } from '@supabase/supabase-js'
import { reportError } from '@/lib/monitoring/report-error'
import { deletePostImages, listPostImagePaths } from '@/lib/storage/post-images'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'

type Client = SupabaseClient<Database>

export type CleanupReservedPostsSummary = {
  deletedPostCount: number
  deletedImageCount: number
}

/** 1回の実行で処理する上限。GitHub Actions の日次実行なら十分で、タイムアウトを避ける */
const CLEANUP_BATCH_LIMIT = 500

/**
 * finalize_post は1トランザクションのため、失敗時は丸ごとロールバックして
 * updated_at も更新されない。つまり「再送を試みて何度も失敗している」行と
 * 「1回失敗して完全に放置された」行を updated_at だけでは区別できないため、
 * 生存期間は drafts（expires_at）より長めに取る
 *   docs/product/pending-items.md D19
 */
const RESERVED_POST_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * reservePost / reserveOfficialPost が作った `posts.status='hidden'` の予約行が
 * 一定期間 finalize（createPost / createOfficialPost）されないまま放置されたら、
 * 紐づく Storage の画像フォルダとともに削除する。
 * post_images 行は finalize 成功時にしか作られないため、画像は Storage を直接
 * 列挙して見つける（lib/storage/post-images.ts listPostImagePaths）。
 *
 * `status='hidden'` は通報対応の `hide_post`（app/_actions/admin-reports.ts）でも
 * 既存の公開投稿に対して付く。これは「finalizeされない予約行」とは全く別物（モデレーション
 * 済みの実データで、7日放置されても消してはいけない）ため、`published_at IS NULL`
 * （finalize_post が成功して status='published' になるまで一度も埋まらない列）で
 * 両者を区別する。posts の DELETE RLS は本人のみのため service_role クライアント前提で呼ぶこと
 *   docs/product/pending-items.md D19
 */
export async function cleanupReservedPosts(
  supabase: Client,
): Promise<Result<CleanupReservedPostsSummary, 'INTERNAL_ERROR'>> {
  const cutoff = new Date(Date.now() - RESERVED_POST_TTL_MS).toISOString()

  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('status', 'hidden')
    .is('published_at', null)
    .lt('updated_at', cutoff)
    .limit(CLEANUP_BATCH_LIMIT)

  if (error) {
    reportError('cleanup-reserved-posts', '予約投稿の取得に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }
  if (data.length === 0) {
    return { ok: true, data: { deletedPostCount: 0, deletedImageCount: 0 } }
  }

  // DELETEをStorage削除より先に確定させる: SELECTとDELETEの間に本人がfinalize（再送成功）
  // した投稿は、この eq/lt 再判定で対象から外れる。もしStorage削除を先に行っていたら、
  // 再送成功直後に公開されたばかりの画像をそのまま消してしまう（公開投稿の画像が壊れる）。
  // 削除行だけを後段のStorage削除対象にすることでこの事故を避ける
  const postIds = data.map((row) => row.id)
  const { data: deletedRows, error: deleteError } = await supabase
    .from('posts')
    .delete()
    .in('id', postIds)
    .eq('status', 'hidden')
    .is('published_at', null)
    .lt('updated_at', cutoff)
    .select('id, author_id')

  if (deleteError) {
    reportError('cleanup-reserved-posts', '予約投稿の削除に失敗', deleteError)
    return { ok: false, error: 'INTERNAL_ERROR', details: deleteError.message }
  }
  if (deletedRows.length === 0) {
    return { ok: true, data: { deletedPostCount: 0, deletedImageCount: 0 } }
  }

  const listResults = await Promise.all(
    deletedRows.map((row) => listPostImagePaths(supabase, row.author_id, row.id)),
  )

  const imagePaths: string[] = []
  for (const listed of listResults) {
    if (!listed.ok) {
      reportError('cleanup-reserved-posts', 'Storageフォルダの列挙に失敗', listed.details)
      return { ok: false, error: 'INTERNAL_ERROR', details: listed.details }
    }
    imagePaths.push(...listed.data)
  }

  if (imagePaths.length > 0) {
    const deleted = await deletePostImages(supabase, imagePaths)
    if (!deleted.ok) {
      reportError('cleanup-reserved-posts', 'Storage画像の削除に失敗', deleted.details)
      return { ok: false, error: 'INTERNAL_ERROR', details: deleted.details }
    }
  }

  return {
    ok: true,
    data: { deletedPostCount: deletedRows.length, deletedImageCount: imagePaths.length },
  }
}
