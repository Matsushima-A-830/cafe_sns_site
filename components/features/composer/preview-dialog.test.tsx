import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PreviewDialog } from './preview-dialog'

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '書きかけの本文' }] }],
}

describe('PreviewDialog', () => {
  it('タイトルと本文を投稿詳細と同じ描画で表示する', () => {
    render(
      <PreviewDialog open onOpenChange={() => {}} title="雨の日の喫茶店" bodyJson={bodyJson} />,
    )
    expect(screen.getByRole('heading', { name: '雨の日の喫茶店' })).toBeInTheDocument()
    expect(screen.getByText('書きかけの本文')).toBeInTheDocument()
  })

  it('タイトル未入力なら代わりの文言を出す', () => {
    render(<PreviewDialog open onOpenChange={() => {}} title="  " bodyJson={bodyJson} />)
    expect(screen.getByRole('heading', { name: 'タイトル未入力' })).toBeInTheDocument()
  })

  it('閉じているときは何も描画しない', () => {
    render(
      <PreviewDialog open={false} onOpenChange={() => {}} title="タイトル" bodyJson={bodyJson} />,
    )
    expect(screen.queryByText('書きかけの本文')).not.toBeInTheDocument()
  })
})
