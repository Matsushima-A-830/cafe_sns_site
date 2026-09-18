import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { type ListShortcut, ListShortcuts, SHORTCUT_ICONS } from './list-shortcuts'

const shortcuts: ListShortcut[] = [
  {
    key: 'favorite',
    href: '/me/favorites',
    label: 'お気に入り',
    count: 42,
    Icon: SHORTCUT_ICONS.Heart,
  },
  { key: 'drafts', href: '/me/drafts', label: '下書き', count: 0, Icon: SHORTCUT_ICONS.FileText },
]

describe('ListShortcuts', () => {
  // 視覚的には「42」だけを大きく出すので、支援技術には件数の意味まで伝わる必要がある
  it('件数を「ラベル N件」として読み上げさせる', () => {
    render(<ListShortcuts shortcuts={shortcuts} />)

    expect(screen.getByRole('link', { name: 'お気に入り 42件' })).toHaveAttribute(
      'href',
      '/me/favorites',
    )
    expect(screen.getByRole('link', { name: '下書き 0件' })).toBeInTheDocument()
  })

  it('渡されたカードだけを出す（保存投稿は未実装なので並ばない）', () => {
    render(<ListShortcuts shortcuts={shortcuts} />)

    expect(screen.getAllByRole('link').length).toBe(2)
    expect(screen.queryByRole('link', { name: /保存/ })).not.toBeInTheDocument()
  })
})
