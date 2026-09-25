import type { SupabaseClient } from '@supabase/supabase-js'
import exifr from 'exifr'
import type { Database } from '@/types/database'
import type { Result } from '@/types/result'
import { POST_IMAGE_BUCKET } from './post-images'

// A10: 署名付きURL直PUTでサーバーがバイト列を検証できないため、クライアント側の
// EXIF除去（processPostImage）が迂回された場合の保険。finalize直前に読み直して確認する
//   docs/product/pending-items.md A10

type Client = SupabaseClient<Database>
type CheckResult = Result<null, 'EXIF_STRIP_FAILED' | 'INTERNAL_ERROR'>

const RIFF_MAGIC = 'RIFF'
const WEBP_MAGIC = 'WEBP'
const EXIF_CHUNK_ID = 'EXIF'
// 一部エンコーダは EXIF チャンクの中身に JPEG の APP1 と同じ "Exif\0\0" プレフィックスを付ける
const EXIF_TIFF_PREFIX = 'Exif\0\0'
const latin1Decoder = new TextDecoder('latin1')

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  return (
    latin1Decoder.decode(bytes.subarray(0, 4)) === RIFF_MAGIC &&
    latin1Decoder.decode(bytes.subarray(8, 12)) === WEBP_MAGIC
  )
}

/**
 * post-images は必ずWebPだが、exifr はWebPコンテナ自体を認識できず
 * （"Unknown file format" で例外になる）GPSの有無を判定できない。
 * WebPのEXIFチャンクの中身は生のTIFF/EXIFブロックそのものなので、それだけ取り出して
 * exifrに渡す（TIFF単体はexifrが解釈できる）。EXIFチャンクが無ければGPSはそもそも
 * 存在しない（GPSはEXIF内にしか無い）ので、その場合は抽出自体を諦めて null を返す
 */
function extractWebpExifPayload(buffer: ArrayBuffer): ArrayBuffer | null {
  const bytes = new Uint8Array(buffer)
  if (!isWebp(bytes)) return null

  const view = new DataView(buffer)
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const fourCC = latin1Decoder.decode(bytes.subarray(offset, offset + 4))
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    if (fourCC === EXIF_CHUNK_ID) {
      const payload = buffer.slice(dataStart, dataStart + size)
      const prefix = latin1Decoder.decode(
        new Uint8Array(payload, 0, Math.min(6, payload.byteLength)),
      )
      return prefix === EXIF_TIFF_PREFIX ? payload.slice(6) : payload
    }
    // チャンクは奇数長なら1バイトパディングされる（RIFF仕様）
    offset = dataStart + size + (size % 2)
  }
  return null
}

/**
 * - exifr.gps() に Blob をそのまま渡すとブラウザ専用の FileReader 依存で例外になるため
 *   arrayBuffer() に変換してから渡す
 * - パース失敗は「GPS無し」とはみなさず INTERNAL_ERROR にする。安全側（=通す）へ倒すと
 *   壊れた/細工されたEXIFがこの保険自体の回避経路になってしまう
 */
async function checkGps(bytes: ArrayBuffer): Promise<CheckResult> {
  try {
    const gps = await exifr.gps(bytes)
    return gps ? { ok: false, error: 'EXIF_STRIP_FAILED' } : { ok: true, data: null }
  } catch (cause) {
    return {
      ok: false,
      error: 'INTERNAL_ERROR',
      details: cause instanceof Error ? cause.message : String(cause),
    }
  }
}

async function checkOne(supabase: Client, path: string): Promise<CheckResult> {
  const { data, error } = await supabase.storage.from(POST_IMAGE_BUCKET).download(path)
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

  const bytes = new Uint8Array(buffer)
  if (isWebp(bytes)) {
    const exifPayload = extractWebpExifPayload(buffer)
    if (exifPayload === null) return { ok: true, data: null }
    return checkGps(exifPayload)
  }

  return checkGps(buffer)
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
