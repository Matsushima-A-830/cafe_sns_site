/**
 * exifr を実際に通す統合テスト用の最小JPEGを組み立てる。実写真ファイルをリポジトリに
 * 置く代わりに、TIFF/EXIF/GPS IFD をバイト単位で構築する（外部アセット不要・サイズ最小）
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

/** GPSLatitudeRef/GPSLatitude/GPSLongitudeRef/GPSLongitude を持つ最小JPEGを返す */
export function buildGpsTaggedJpeg(): Buffer {
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

  const exifBlock = Buffer.concat([tiffHeader, ifd0, gpsIfd, rationalData])
  const app1Payload = Buffer.concat([Buffer.from('Exif\0\0'), exifBlock])
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
