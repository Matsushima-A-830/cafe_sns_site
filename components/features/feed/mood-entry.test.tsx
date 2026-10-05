import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PostListTag } from '@/lib/posts/post-list'
import { MoodEntry } from './mood-entry'

const tags: PostListTag[] = [
  { id: 't1', slug: 'date', label: 'デート' },
  { id: 't2', slug: 'morning', label: '早朝営業' },
]

describe('MoodEntry', () => {
  it('タグが無ければ何も出さない', () => {
    const { container } = render(<MoodEntry tags={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('各タグが絞り込みリンクになる', () => {
    render(<MoodEntry tags={tags} />)
    expect(screen.getByRole('link', { name: 'デート' })).toHaveAttribute(
      'href',
      '/explore?tag=date',
    )
  })

  it('スクロールの余地が無ければ矢印ボタンを出さない（jsdomの既定レイアウトは幅0）', () => {
    render(<MoodEntry tags={tags} />)
    expect(screen.queryByRole('button', { name: '前の気分を見る' })).toBeNull()
    expect(screen.queryByRole('button', { name: '次の気分を見る' })).toBeNull()
  })

  it('横スクロールの余地があれば矢印ボタンで次へページ送りできる（PCでドラッグ操作させない）', () => {
    render(<MoodEntry tags={tags} />)
    const list = screen.getByRole('list')

    // jsdom はレイアウト計算をしないため、オーバーフロー状態を手動で作る
    Object.defineProperty(list, 'scrollWidth', { value: 600, configurable: true })
    Object.defineProperty(list, 'clientWidth', { value: 300, configurable: true })
    Object.defineProperty(list, 'scrollLeft', { value: 0, configurable: true, writable: true })
    fireEvent.resize(window)

    const nextButton = screen.getByRole('button', { name: '次の気分を見る' })
    const scrollBy = vi.fn()
    list.scrollBy = scrollBy

    fireEvent.click(nextButton)
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 240, behavior: 'smooth' }),
    )
  })
})
