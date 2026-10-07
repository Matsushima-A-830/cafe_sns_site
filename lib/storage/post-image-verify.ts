import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'
import { detectGpsExif } from './exif-gps-check'
import { POST_IMAGE_BUCKET } from './post-images'

// A10: 署名付きURL直PUTでサーバーがバイト列を検証できないため、クライアント側の
// EXIF除去（processPostImage）が迂回された場合の保険。finalize直前に読み直して確認する
//   docs/product/pending-items.md A10
// bucket は post-images がデフォルトだが、同じ理由（個人の写真）で avatars からも
// 呼ばれる（lib/storage/avatars.ts）ため引数化している

type Client = SupabaseClient<Database>
type CheckResult = Result<null, 'EXIF_STRIP_FAILED' | 'INTERNAL_ERROR'>

async function checkOne(supabase: Client, bucket: string, path: string): Promise<CheckResult> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return { ok: false, error: 'INTERNAL_ERROR', details: error?.message }

  let buffer: ArrayBuffer
  try {
    buffer = await data.arrayBuffer()
  } catch (cause) {
    return {
      ok: false,
      error: 'INTERNAL_ERROR',
      details: cause instanceof Error ? cause.message : String(cause),
    }
  }

  const detection = await detectGpsExif(buffer)
  if (!detection.ok) return detection
  return detection.data ? { ok: false, error: 'EXIF_STRIP_FAILED' } : { ok: true, data: null }
}

export async function verifyNoGpsExif(
  supabase: Client,
  paths: string[],
  bucket: string = POST_IMAGE_BUCKET,
): Promise<CheckResult> {
  const checks = await Promise.all(paths.map((path) => checkOne(supabase, bucket, path)))

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
