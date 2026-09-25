/**
 * exifr を実際に通す統合テスト用の最小画像を組み立てる。実写真ファイルをリポジトリに
 * 置く代わりに、TIFF/EXIF/GPS IFD をバイト単位で構築する（外部アセット不要・サイズ最小）。
 * JPEG（APP1セグメント）とWebP（EXIFチャンク）はどちらもこの生TIFFブロックを包むだけ
 */

function u16be(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n, 0)
  return b
}
function u16le(n: number): Buffer {
  const b = Buffer.alloc(2)
  b.writeUInt16LE(n, 0)
  return b
}
function u32le(n: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n, 0)
  return b
}
function ifdEntry(tag: number, type: number, count: number, valueOrOffset: Buffer): Buffer {
  return Buffer.concat([u16le(tag), u16le(type), u32le(count), valueOrOffset])
}

/** GPSLatitudeRef/GPSLatitude/GPSLongitudeRef/GPSLongitude を持つ生のTIFF/EXIFブロックを返す */
export function buildGpsExifTiffBlock(): Buffer {
  const gpsIfdEntryCount = 4
  const gpsIfdSize = 2 + gpsIfdEntryCount * 12 + 4

  const tiffHeaderSize = 8
  const ifd0Size = 2 + 1 * 12 + 4
  const gpsIfdOffset = tiffHeaderSize + ifd0Size
  const rationalDataOffset = gpsIfdOffset + gpsIfdSize

  const latRational = Buffer.concat([u32le(35), u32le(1), u32le(40), u32le(1), u32le(0), u32le(1)])
  const lonRational = Buffer.concat([u32le(139), u32le(1), u32le(45), u32le(1), u32le(0), u32le(1)])
  const rationalData = Buffer.concat([latRational, lonRational])
  const lonRationalOffset = rationalDataOffset + latRational.length

  const gpsEntries = Buffer.concat([
    ifdEntry(0x0001, 2, 2, Buffer.concat([Buffer.from('N\0'), Buffer.alloc(2)])),
    ifdEntry(0x0002, 5, 3, u32le(rationalDataOffset)),
    ifdEntry(0x0003, 2, 2, Buffer.concat([Buffer.from('E\0'), Buffer.alloc(2)])),
    ifdEntry(0x0004, 5, 3, u32le(lonRationalOffset)),
  ])
  const gpsIfd = Buffer.concat([u16le(gpsIfdEntryCount), gpsEntries, u32le(0)])

  const ifd0Entries = ifdEntry(0x8825, 4, 1, u32le(gpsIfdOffset))
  const ifd0 = Buffer.concat([u16le(1), ifd0Entries, u32le(0)])

  const tiffHeader = Buffer.concat([Buffer.from('II'), u16le(42), u32le(8)])

  return Buffer.concat([tiffHeader, ifd0, gpsIfd, rationalData])
}

/** GPS付きEXIFを持つ最小JPEG */
export function buildGpsTaggedJpeg(): Buffer {
  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0'), buildGpsExifTiffBlock()])
  // JPEG セグメント長は big-endian（内部の TIFF は little-endian）で、長さ自体の2バイトを含む
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    u16be(app1Payload.length + 2),
    app1Payload,
  ])

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])])
}

/** EXIFを持たない最小JPEG（SOI+EOIのみ） */
export function buildPlainJpeg(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xd9])
}

function riffChunk(fourCC: string, payload: Buffer): Buffer {
  const padded = payload.length % 2 === 1 ? Buffer.concat([payload, Buffer.from([0])]) : payload
  return Buffer.concat([Buffer.from(fourCC), u32le(payload.length), padded])
}

// 1x1のロスレスVP8Lビットストリーム。ピクセル内容はexifrのGPS判定と無関係で、
// 「本物のWebPコンテナである」ことだけが必要
const MINIMAL_VP8L_PIXEL_DATA = Buffer.from([0x2f, 0x00, 0x00, 0x00, 0x00, 0x88, 0x88, 0x08])

function buildWebp(exifChunk?: Buffer): Buffer {
  const vp8xPayload = Buffer.concat([
    Buffer.from([exifChunk ? 0x08 : 0x00]), // bit3 = EXIF chunk present
    Buffer.alloc(3), // reserved
    Buffer.alloc(3), // canvas width-1 (24bit LE) = 1x1
    Buffer.alloc(3), // canvas height-1
  ])
  const chunks = [riffChunk('VP8X', vp8xPayload), riffChunk('VP8L', MINIMAL_VP8L_PIXEL_DATA)]
  if (exifChunk) chunks.push(riffChunk('EXIF', exifChunk))

  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks])
  return Buffer.concat([Buffer.from('RIFF'), u32le(body.length), body])
}

/** GPS付きEXIFチャンクを持つ本物のWebP（post-imagesの実運用と同じコンテナ形式） */
export function buildGpsTaggedWebp(): Buffer {
  return buildWebp(buildGpsExifTiffBlock())
}

/** EXIFチャンクを持たない本物のWebP（processPostImage後の通常の投稿画像と同じ状態） */
export function buildPlainWebp(): Buffer {
  return buildWebp()
}
