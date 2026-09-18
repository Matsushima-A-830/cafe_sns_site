import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ListPreviewTabs, type PreviewLane } from './list-preview-tabs'

const lanes: PreviewLane[] = [
  {
    key: 'favorite',
    label: 'お気に入り',
    href: '/me/favorites',
    items: [{ key: 'a', href: '/cafes/a', primary: '表参道ロースタリー', secondary: '渋谷' }],
    emptyMessage: 'お気に入りはまだありません。',
  },
  {
    key: 'want_to_go',
    label: '行きたい',
    href: '/me/want-to-go',
    items: [],
    emptyMessage: '行きたいはまだありません。',
  },
]

describe('ListPreviewTabs', () => {
  it('最初のレーンを選択済みで描く', () => {
    render(<ListPreviewTabs lanes={lanes} />)

    expect(screen.getByRole('tab', { name: 'お気に入り' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '行きたい' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('表参道ロースタリー')).toBeInTheDocument()
  })

  it('タブを押すと取得せずに中身が入れ替わる', async () => {
    const user = userEvent.setup()
    render(<ListPreviewTabs lanes={lanes} />)

    await user.click(screen.getByRole('tab', { name: '行きたい' }))

    expect(screen.getByRole('tab', { name: '行きたい' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('表参道ロースタリー')).not.toBeInTheDocument()
    expect(screen.getByText('行きたいはまだありません。')).toBeInTheDocument()
  })

  it('空のレーンには「すべて見る」を出さない', async () => {
    const user = userEvent.setup()
    render(<ListPreviewTabs lanes={lanes} />)

    expect(screen.getByRole('link', { name: /お気に入りをすべて見る/ })).toHaveAttribute(
      'href',
      '/me/favorites',
    )

    await user.click(screen.getByRole('tab', { name: '行きたい' }))
    expect(screen.queryByRole('link', { name: /すべて見る/ })).not.toBeInTheDocument()
  })

  it('タブパネルは選択中のタブに紐付く', () => {
    render(<ListPreviewTabs lanes={lanes} />)

    const tab = screen.getByRole('tab', { name: 'お気に入り' })
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab.id)
  })
})
