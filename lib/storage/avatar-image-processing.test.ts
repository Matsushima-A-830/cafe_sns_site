import { describe, expect, it, vi } from 'vitest'
import { AVATAR_MAX_BYTES } from './avatars'

const { processPostImageMock } = vi.hoisted(() => ({ processPostImageMock: vi.fn() }))

vi.mock('./post-image-processing', async (importOriginal) => ({
  ...(await importOriginal()),
  processPostImage: processPostImageMock,
}))

describe('processAvatarImage', () => {
  it('post用より小さい長辺・avatar用のバイト上限を指定して processPostImage を呼ぶ', async () => {
    processPostImageMock.mockResolvedValue({
      ok: true,
      data: { blob: new Blob(), width: 1, height: 1 },
    })
    const { processAvatarImage } = await import('./avatar-image-processing')

    const file = new File([], 'a.png', { type: 'image/png' })
    await processAvatarImage(file)

    expect(processPostImageMock).toHaveBeenCalledWith(file, {
      maxEdgePx: 512,
      maxBytes: AVATAR_MAX_BYTES,
      qualities: [0.85, 0.75, 0.65],
    })
  })
})
