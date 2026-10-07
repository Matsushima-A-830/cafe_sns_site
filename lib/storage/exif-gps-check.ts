import exifr from 'exifr'
import type { Result } from '@/types/result'

// exifr（v7.1.3）はWebPコンテナ自体を認識できず（"Unknown file format" で例外になる）、
// GPSの有無を判定できない。WebPのEXIFチャンクの中身は生のTIFF/EXIFブロックそのものなので、
// それだけ取り出してexifrに渡す（TIFF単体はexifrが解釈できる）。
// クライアント側（processPostImage）とサーバー側（verifyNoGpsExif）の両方が
// post-images / avatars（いずれも必ずWebP）のGPS再検証に使うため共通化する
//   memory project_exifr_webp_limitation

const RIFF_MAGIC = 'RIFF'
const WEBP_MAGIC = 'WEBP'
const EXIF_CHUNK_ID = 'EXIF'
// 一部エンコーダは EXIF チャンクの中身に JPEG の APP1 と同じ "Exif\0\0" プレフィックスを付ける
const EXIF_TIFF_PREFIX = 'Exif\0\0'
const latin1Decoder = new TextDecoder('latin1')

export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false
  return (
    latin1Decoder.decode(bytes.subarray(0, 4)) === RIFF_MAGIC &&
    latin1Decoder.decode(bytes.subarray(8, 12)) === WEBP_MAGIC
  )
}

/**
 * WebPのEXIFチャンクが無ければGPSはそもそも存在しない（GPSはEXIF内にしか無い）ので、
 * その場合は抽出自体を諦めて null を返す
 */
export function extractWebpExifPayload(buffer: ArrayBuffer): ArrayBuffer | null {
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
 * バイト列（WebP・JPEG等）にGPS付きEXIFが含まれているかを判定する。
 * パース失敗は「GPS無し」とはみなさず INTERNAL_ERROR にする。安全側（=通す）へ倒すと
 * 壊れた/細工されたEXIFがこの検証自体の回避経路になってしまう。
 * 呼び出し側でエラー時の扱い（fail-open/fail-closed）を決める
 */
export async function detectGpsExif(
  buffer: ArrayBuffer,
): Promise<Result<boolean, 'INTERNAL_ERROR'>> {
  const bytes = new Uint8Array(buffer)
  let payload: ArrayBuffer = buffer
  if (isWebp(bytes)) {
    const exifPayload = extractWebpExifPayload(buffer)
    if (exifPayload === null) return { ok: true, data: false }
    payload = exifPayload
  }

  try {
    const gps = await exifr.gps(payload)
    return { ok: true, data: Boolean(gps) }
  } catch (cause) {
    return {
      ok: false,
      error: 'INTERNAL_ERROR',
      details: cause instanceof Error ? cause.message : String(cause),
    }
  }
}
