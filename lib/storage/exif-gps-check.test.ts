import { describe, expect, it } from 'vitest'
import {
  buildGpsTaggedJpeg,
  buildGpsTaggedWebp,
  buildPlainJpeg,
  buildPlainWebp,
} from '../../tests/helpers/gps-exif-fixture'
import { detectGpsExif } from './exif-gps-check'

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return new Uint8Array(buffer).slice().buffer
}

describe('detectGpsExif', () => {
  it('GPS付きJPEGを検出する', async () => {
    const result = await detectGpsExif(toArrayBuffer(buildGpsTaggedJpeg()))
    expect(result).toEqual({ ok: true, data: true })
  })

  it('EXIFの無いJPEGはGPS無しと判定する', async () => {
    const result = await detectGpsExif(toArrayBuffer(buildPlainJpeg()))
    expect(result).toEqual({ ok: true, data: false })
  })

  // exifr はWebPコンテナ自体を認識できないため、EXIFチャンクを取り出さずに渡すと
  // 常に例外になり GPS を検出できない（processPostImage で踏んでいた dead code の回帰テスト）
  it('GPS付きの本物のWebPを検出する', async () => {
    const result = await detectGpsExif(toArrayBuffer(buildGpsTaggedWebp()))
    expect(result).toEqual({ ok: true, data: true })
  })

  it('EXIFチャンクの無い本物のWebPはGPS無しと判定する', async () => {
    const result = await detectGpsExif(toArrayBuffer(buildPlainWebp()))
    expect(result).toEqual({ ok: true, data: false })
  })
})
