import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PostDetailImage } from '@/lib/posts/post-detail'
import { PostGallery } from './post-gallery'

const imageA: PostDetailImage = {
  url: 'http://127.0.0.1:54321/storage/v1/object/public/post-images/u1/p1/a.webp',
  altText: '',
}
const imageB: PostDetailImage = {
  url: 'http://127.0.0.1:54321/storage/v1/object/public/post-images/u1/p1/b.webp',
  altText: '',
}
const imageC: PostDetailImage = {
  url: 'http://127.0.0.1:54321/storage/v1/object/public/post-images/u1/p1/c.webp',
  altText: '',
}
const images: PostDetailImage[] = [imageA, imageB, imageC]

describe('PostGallery', () => {
  it('画像が無ければ何も出さない', () => {
    const { container } = render(<PostGallery images={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('1枚だけなら矢印ボタンも枚数表示も出さない', () => {
    render(<PostGallery images={[imageA]} />)
    expect(screen.queryByRole('button', { name: '前の写真' })).toBeNull()
    expect(screen.queryByRole('button', { name: '次の写真' })).toBeNull()
    expect(screen.queryByText('1 / 1')).toBeNull()
  })

  it('先頭では「次へ」だけ、末尾まで送ると「前へ」だけが出る', () => {
    render(<PostGallery images={images} />)

    expect(screen.queryByRole('button', { name: '前の写真' })).toBeNull()

    const scrollEl = screen.getByLabelText('写真3枚').querySelector('[tabindex]')
    expect(scrollEl).not.toBeNull()
    if (scrollEl) {
      Object.defineProperty(scrollEl, 'clientWidth', { value: 400, configurable: true })
      // jsdom は scrollTo を実装していない
      // biome-ignore lint/suspicious/noExplicitAny: jsdom にメソッド自体が無いため上書きする
      ;(scrollEl as any).scrollTo = () => {}
    }

    fireEvent.click(screen.getByRole('button', { name: '次の写真' }))
    expect(screen.getByRole('button', { name: '前の写真' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次の写真' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '次の写真' }))
    expect(screen.queryByRole('button', { name: '次の写真' })).toBeNull()
    expect(screen.getByRole('button', { name: '前の写真' })).toBeInTheDocument()
  })
})
