import type { Page } from '@playwright/test'
import { buildGpsTaggedJpeg } from '../../helpers/gps-exif-fixture'

/**
 * tests/helpers/gps-exif-fixture.ts の buildGpsTaggedJpeg() はEXIFパース専用の
 * 最小バイト列（SOI+APP1+EOIのみ、実際のスキャンデータが無い）で、実ブラウザの
 * createImageBitmap では "Unknown image format" で拒否される（composer-short.spec.ts
 * で実機確認して判明）。E2Eでは実際にデコード可能なJPEGが要るため、ページ内の
 * canvas.toBlob で本物のJPEGを作り、そのSOI直後に同じGPS付きEXIFのAPP1セグメントを
 * 差し込む。カメラが吐くExif-onlyのJPEG（APP0無し・SOI直後にAPP1）と同じ構造になる
 */

async function canvasJpegBase64(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context を取得できない')
    ctx.fillStyle = '#c47a3d'
    ctx.fillRect(0, 0, 4, 4)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    )
    if (!blob) throw new Error('canvas.toBlob が null を返した')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })
}

/** GPS付きEXIF（APP1）を持つ、実ブラウザでデコード可能な最小JPEG */
export async function buildRealGpsJpeg(page: Page): Promise<Buffer> {
  const base = Buffer.from(await canvasJpegBase64(page), 'base64')
  const fakeForApp1 = buildGpsTaggedJpeg()
  // buildGpsTaggedJpeg() は [SOI(2) + APP1 + EOI(2)] なので、中身のAPP1だけ取り出す
  const app1 = fakeForApp1.subarray(2, fakeForApp1.length - 2)
  return Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)])
}

/** EXIFを持たない、実ブラウザでデコード可能な最小JPEG */
export async function buildRealPlainJpeg(page: Page): Promise<Buffer> {
  return Buffer.from(await canvasJpegBase64(page), 'base64')
}
