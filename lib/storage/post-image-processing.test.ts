import { describe, expect, it, vi } from 'vitest'
import { encodeWithinLimit, scaledSize } from './post-image-processing'
import { POST_IMAGE_CONTENT_TYPE, POST_IMAGE_MAX_BYTES } from './post-images'

// createImageBitmap / canvas.toBlob は jsdom に無いため、processPostImage 全体は
// E2E（Playwright）側で担保する。ここでは縮小計算と品質フォールバックの判断を検証する

function blobOfSize(size: number, type = POST_IMAGE_CONTENT_TYPE): Blob {
  return { size, type } as Blob
}

describe('scaledSize', () => {
  it('長辺が上限以下ならそのまま返す', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(scaledSize(2048, 100)).toEqual({ width: 2048, height: 100 })
  })

  it('長辺を2048に収め、アスペクト比を保つ', () => {
    expect(scaledSize(4096, 2048)).toEqual({ width: 2048, height: 1024 })
    expect(scaledSize(1000, 4000)).toEqual({ width: 512, height: 2048 })
  })

  it('極端なアスペクト比でも短辺を0pxにしない（toBlob が null を返すため）', () => {
    const { width, height } = scaledSize(100_000, 10)

    expect(width).toBe(2048)
    expect(height).toBeGreaterThanOrEqual(1)
  })
})

describe('encodeWithinLimit', () => {
  it('上限に収まった時点で品質を落とすのをやめる', async () => {
    const encode = vi.fn(async (_quality: number) => blobOfSize(1024))

    const result = await encodeWithinLimit(encode)

    expect(result).toEqual({ ok: true, data: blobOfSize(1024) })
    expect(encode).toHaveBeenCalledTimes(1)
  })

  it('大きすぎる間は品質を段階的に落とす', async () => {
    const sizes = [POST_IMAGE_MAX_BYTES + 1, POST_IMAGE_MAX_BYTES + 1, 1024]
    const encode = vi.fn(async (_quality: number) => blobOfSize(sizes.shift() ?? 1024))

    const result = await encodeWithinLimit(encode)

    expect(encode).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(true)
    // 品質は下げる方向にだけ動く
    const qualities = encode.mock.calls.map(([quality]) => quality)
    expect(qualities).toEqual([...qualities].sort((a, b) => b - a))
  })

  it('最低品質でも上限を超えたら FILE_TOO_LARGE', async () => {
    const encode = vi.fn(async (_quality: number) => blobOfSize(POST_IMAGE_MAX_BYTES + 1))

    const result = await encodeWithinLimit(encode)

    expect(result).toEqual({ ok: false, error: 'FILE_TOO_LARGE' })
  })

  it('WebP 非対応で PNG が返ったら UNSUPPORTED_MEDIA_TYPE（Safari 検証の判断材料）', async () => {
    const result = await encodeWithinLimit(async () => blobOfSize(1024, 'image/png'))

    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })

  it('エンコードできなかった（null）場合も UNSUPPORTED_MEDIA_TYPE にする', async () => {
    const result = await encodeWithinLimit(async () => null)

    expect(result).toEqual({ ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' })
  })
})
