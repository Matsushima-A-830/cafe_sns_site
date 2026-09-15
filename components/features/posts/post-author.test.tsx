import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostAuthor } from './post-author'

const author = { username: 'kaho', displayName: 'かほ', avatarUrl: null }
const publishedAt = '2026-09-14T01:00:00Z'

describe('PostAuthor', () => {
  it('表示名・投稿日・プロフィールへのリンクを出す', () => {
    render(<PostAuthor author={author} publishedAt={publishedAt} />)
    expect(screen.getByRole('link', { name: 'かほ' })).toHaveAttribute('href', '/users/kaho')
    expect(screen.getByText('2026年9月14日')).toBeInTheDocument()
  })

  it('自前の Storage のアバターだけを画像として出す', () => {
    const { container } = render(
      <PostAuthor
        author={{
          ...author,
          avatarUrl: 'http://127.0.0.1:54321/storage/v1/object/public/avatars/kaho.webp',
        }}
        publishedAt={publishedAt}
      />,
    )
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('外部ホストのアバターは頭文字のプレースホルダに落とす', () => {
    const { container } = render(
      <PostAuthor
        author={{ ...author, avatarUrl: 'https://attacker.example/px.gif' }}
        publishedAt={publishedAt}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('か')).toBeInTheDocument()
  })
})
