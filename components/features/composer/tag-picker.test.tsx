import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComposerTag } from '@/types/composer'
import { TagPicker } from './tag-picker'

const tags: ComposerTag[] = [
  { id: 'tag-1', label: '朝カフェ', category: 'occasion' },
  { id: 'tag-2', label: 'ひとり時間', category: 'occasion' },
  { id: 'tag-3', label: '静か', category: 'mood' },
  { id: 'tag-4', label: 'レトロ', category: 'mood' },
  { id: 'tag-5', label: '自家焙煎', category: 'other' },
  { id: 'tag-6', label: '禁煙', category: 'other' },
]

function setup(props: Partial<React.ComponentProps<typeof TagPicker>> = {}) {
  const onChange = vi.fn()
  render(
    <TagPicker
      tags={tags}
      suggestedTagIds={props.suggestedTagIds ?? []}
      selectedTagIds={props.selectedTagIds ?? []}
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange, user: userEvent.setup() }
}

describe('TagPicker', () => {
  it('おすすめタグをワンタップで追加できる', async () => {
    const { onChange, user } = setup({ suggestedTagIds: ['tag-1'] })

    await user.click(screen.getByRole('button', { name: '+ 朝カフェ' }))

    expect(onChange).toHaveBeenCalledWith(['tag-1'])
  })

  it('選択済みのタグはおすすめ枠から消える', () => {
    setup({ suggestedTagIds: ['tag-1'], selectedTagIds: ['tag-1'] })

    expect(screen.queryByRole('button', { name: '+ 朝カフェ' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#朝カフェ ✕' })).toBeInTheDocument()
  })

  it('選択中のタグをタップすると外れる', async () => {
    const { onChange, user } = setup({ selectedTagIds: ['tag-1', 'tag-3'] })

    await user.click(screen.getByRole('button', { name: '#朝カフェ ✕' }))

    expect(onChange).toHaveBeenCalledWith(['tag-3'])
  })

  it('5個選ぶと未選択のタグは押せなくなる（選択のパラドックス回避の上限）', async () => {
    const { user } = setup({ selectedTagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5'] })

    await user.click(screen.getByRole('button', { name: '+ タグを追加' }))

    expect(screen.getByRole('button', { name: '禁煙' })).toBeDisabled()
    expect(
      screen.getByText('タグは5個までです。入れ替えるには選択中のタグを外してください'),
    ).toBeInTheDocument()
  })

  it('上限に達したらおすすめ枠自体を出さない', () => {
    setup({
      suggestedTagIds: ['tag-6'],
      selectedTagIds: ['tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5'],
    })

    expect(screen.queryByText('おすすめタグ（あなたの好みから）')).not.toBeInTheDocument()
  })

  it('マスタに無いタグIDが混ざっても落ちない（下書き保存後にタグが削除された場合）', () => {
    setup({ selectedTagIds: ['tag-1', 'deleted-tag'] })

    expect(screen.getByRole('button', { name: '#朝カフェ ✕' })).toBeInTheDocument()
  })
})
