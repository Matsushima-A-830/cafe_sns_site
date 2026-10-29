import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ComposerFields } from './use-composer'

const POST_ID = '11111111-1111-4111-8111-111111111111'

vi.mock('./use-composer', () => ({
  useComposer: () => {
    const [fields, setFields] = useState<ComposerFields>({
      title: '',
      bodyText: '',
      bodyJson: { type: 'doc', content: [] },
      tagIds: [],
      images: [],
      cafe: null,
      visibility: 'public',
    })
    return {
      status: 'ready',
      postId: POST_ID,
      fields,
      updateFields: (
        patch: Partial<ComposerFields> | ((prev: ComposerFields) => Partial<ComposerFields>),
      ) =>
        setFields((prev) => ({
          ...prev,
          ...(typeof patch === 'function' ? patch(prev) : patch),
        })),
      autosave: 'idle',
      lastSavedAt: null,
      isDirty: false,
      notice: undefined,
      formError: undefined,
      setFormError: vi.fn(),
      isSubmitting: false,
      persistDraft: vi.fn(),
      submit: vi.fn(),
      leave: vi.fn(),
      discard: vi.fn(),
      saveAndLeave: vi.fn(),
    }
  },
}))

const uploadPostImage = vi.fn()
vi.mock('@/lib/storage/post-image-client', () => ({
  uploadPostImage: (postId: string, file: File) => uploadPostImage(postId, file),
}))

vi.mock('@/app/_actions/cafes', () => ({
  searchCafes: vi.fn(async () => ({ ok: true, data: [] })),
}))

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
      }),
    },
  }),
}))

URL.createObjectURL = vi.fn(() => 'blob:mock-url')
URL.revokeObjectURL = vi.fn()

const { BlogComposer } = await import('./blog-composer')

describe('BlogComposer', () => {
  it('タイトルとカフェの間にアイキャッチ画像欄を1枚上限で表示する', () => {
    render(<BlogComposer tags={[]} suggestedTagIds={[]} />)

    const heading = screen.getByText('アイキャッチ画像')
    const cafeLabel = screen.getByText(/どのカフェですか/)
    expect(
      heading.compareDocumentPosition(cafeLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText(/最大1枚/)).toBeInTheDocument()
  })

  it('画像を選択すると選択した写真として表示され、送信ペイロードに乗る状態になる', async () => {
    uploadPostImage.mockResolvedValue({
      ok: true,
      data: {
        path: 'u/p/1.webp',
        width: 10,
        height: 10,
        blob: new Blob(['x'], { type: 'image/webp' }),
      },
    })
    render(<BlogComposer tags={[]} suggestedTagIds={[]} />)

    const file = new File(['a'], 'a.png', { type: 'image/png' })
    const input = screen.getByLabelText('追加') as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => expect(screen.getByAltText('選択した写真 1枚目')).toBeInTheDocument())
    expect(uploadPostImage).toHaveBeenCalledWith(POST_ID, file)
  })
})
