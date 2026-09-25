import type { SupabaseClient } from '@supabase/supabase-js'
import exifr from 'exifr'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'
import { POST_IMAGE_BUCKET } from './post-images'

/**
 * POST /api/uploads/sign は署名付きURL発行のみでファイルのバイト列を見ないため、
 * 改造クライアントや実装バグでクライアント側のEXIF除去（processPostImage）が
 * 迂回されると GPS付き画像がそのまま post-images（公開バケット）に入り得る。
 * createPost / createOfficialPost の finalize 直前でアップロード済みの画像を
 * 読み直し、保険としてサーバー側でも GPS の有無を確認する
 *   docs/product/pending-items.md A10
 */

type Client = SupabaseClient<Database>

/**
 * exifr.gps() に Blob をそのまま渡すとブラウザ専用の FileReader に依存して
 * Node（Server Actions実行環境）で例外になるため、必ず arrayBuffer() に変換してから渡す
 */
export async function verifyNoGpsExif(
  supabase: Client,
  paths: string[],
): Promise<Result<null, 'EXIF_STRIP_FAILED' | 'INTERNAL_ERROR'>> {
  for (const path of paths) {
    const { data, error } = await supabase.storage.from(POST_IMAGE_BUCKET).download(path)
    if (error || !data) {
      return { ok: false, error: 'INTERNAL_ERROR', details: error?.message }
    }

    const gps = await exifr.gps(await data.arrayBuffer()).catch(() => null)
    if (gps) return { ok: false, error: 'EXIF_STRIP_FAILED' }
  }

  return { ok: true, data: null }
}
