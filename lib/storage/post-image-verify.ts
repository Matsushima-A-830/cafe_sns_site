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
type CheckResult = Result<null, 'EXIF_STRIP_FAILED' | 'INTERNAL_ERROR'>

/**
 * exifr.gps() に Blob をそのまま渡すとブラウザ専用の FileReader に依存して
 * Node（Server Actions実行環境）で例外になるため、必ず arrayBuffer() に変換してから渡す。
 * arrayBuffer() 自体の失敗も GPS判定不能として INTERNAL_ERROR にする（安全側に倒して通さない）
 */
async function checkOne(supabase: Client, path: string): Promise<CheckResult> {
  const { data, error } = await supabase.storage.from(POST_IMAGE_BUCKET).download(path)
  if (error || !data) return { ok: false, error: 'INTERNAL_ERROR', details: error?.message }

  try {
    const gps = await exifr.gps(await data.arrayBuffer()).catch(() => null)
    return gps ? { ok: false, error: 'EXIF_STRIP_FAILED' } : { ok: true, data: null }
  } catch (cause) {
    return {
      ok: false,
      error: 'INTERNAL_ERROR',
      details: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

export async function verifyNoGpsExif(supabase: Client, paths: string[]): Promise<CheckResult> {
  const checks = await Promise.all(paths.map((path) => checkOne(supabase, path)))

  // GPS検出は実害があるため、他の画像がダウンロード失敗（INTERNAL_ERROR）でも
  // 揉み消さずに優先して報告する
  const gpsDetected = checks.find((c): c is Extract<CheckResult, { ok: false }> =>
    Boolean(!c.ok && c.error === 'EXIF_STRIP_FAILED'),
  )
  if (gpsDetected) return gpsDetected

  const failed = checks.find((c): c is Extract<CheckResult, { ok: false }> => !c.ok)
  if (failed) return failed

  return { ok: true, data: null }
}
