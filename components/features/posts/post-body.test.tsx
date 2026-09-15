import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PostBody } from './post-body'

/** Tiptap の doc ノードを組み立てる小さなヘルパ（テストの意図を読みやすくする） */
function doc(...content: unknown[]) {
  return { type: 'doc', content }
}
function paragraph(...content: unknown[]) {
  return { type: 'paragraph', content }
}
function text(value: string, marks?: unknown[]) {
  return marks ? { type: 'text', text: value, marks } : { type: 'text', text: value }
}

// tests/setup.ts が入れるローカル既定値（http://127.0.0.1:54321）と同じ配信元
const STORAGE_IMAGE = 'http://127.0.0.1:54321/storage/v1/object/public/post-images/u/p/a.webp'

describe('PostBody', () => {
  it('段落のテキストを描画する', () => {
    render(<PostBody doc={doc(paragraph(text('こんにちは')))} />)
    expect(screen.getByText('こんにちは')).toBeInTheDocument()
  })

  it('見出しを h2 / h3 として描画する', () => {
    render(
      <PostBody
        doc={doc(
          { type: 'heading', attrs: { level: 2 }, content: [text('大見出し')] },
          { type: 'heading', attrs: { level: 3 }, content: [text('小見出し')] },
        )}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: '大見出し' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '小見出し' })).toBeInTheDocument()
  })

  it('h1 や h4 が来ても h2〜h3 の範囲に丸める（ページのh1と競合させない）', () => {
    render(
      <PostBody
        doc={doc(
          { type: 'heading', attrs: { level: 1 }, content: [text('レベル1')] },
          { type: 'heading', attrs: { level: 6 }, content: [text('レベル6')] },
        )}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'レベル1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'レベル6' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('太字・斜体・打ち消し・インラインコードを対応する要素で描画する', () => {
    const { container } = render(
      <PostBody
        doc={doc(
          paragraph(
            text('太字', [{ type: 'bold' }]),
            text('斜体', [{ type: 'italic' }]),
            text('打消', [{ type: 'strike' }]),
            text('コード', [{ type: 'code' }]),
          ),
        )}
      />,
    )
    expect(container.querySelector('strong')?.textContent).toBe('太字')
    expect(container.querySelector('em')?.textContent).toBe('斜体')
    expect(container.querySelector('s')?.textContent).toBe('打消')
    expect(container.querySelector('code')?.textContent).toBe('コード')
  })

  it('リンクは別タブで開き rel を付ける', () => {
    render(
      <PostBody
        doc={doc(
          paragraph(text('リンク', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
        )}
      />,
    )
    const link = screen.getByRole('link', { name: 'リンク' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('nofollow')
  })

  it('http/https 以外のスキームのリンクは素のテキストにする', () => {
    render(
      <PostBody
        doc={doc(
          paragraph(
            text('危険', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
            text('相対', [{ type: 'link', attrs: { href: '/posts/1' } }]),
          ),
        )}
      />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('危険')).toBeInTheDocument()
    expect(screen.getByText('相対')).toBeInTheDocument()
  })

  it('リスト・引用・水平線・改行を描画する', () => {
    const { container } = render(
      <PostBody
        doc={doc(
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [paragraph(text('項目'))] }],
          },
          {
            type: 'orderedList',
            attrs: { start: 3 },
            content: [{ type: 'listItem', content: [paragraph(text('三番目'))] }],
          },
          { type: 'blockquote', content: [paragraph(text('引用'))] },
          { type: 'horizontalRule' },
          paragraph(text('前'), { type: 'hardBreak' }, text('後')),
        )}
      />,
    )
    expect(container.querySelector('ul li')?.textContent).toBe('項目')
    expect(container.querySelector('ol')).toHaveAttribute('start', '3')
    expect(container.querySelector('blockquote')?.textContent).toBe('引用')
    expect(container.querySelector('hr')).toBeInTheDocument()
    expect(container.querySelector('br')).toBeInTheDocument()
  })

  it('コードブロックを pre > code で描画する', () => {
    const { container } = render(
      <PostBody doc={doc({ type: 'codeBlock', content: [text('const a = 1')] })} />,
    )
    expect(container.querySelector('pre code')?.textContent).toBe('const a = 1')
  })

  it('自前の Storage の画像を img として描画する（alt 未入力は装飾扱い）', () => {
    const { container } = render(
      <PostBody doc={doc({ type: 'image', attrs: { src: STORAGE_IMAGE, alt: null } })} />,
    )
    const image = container.querySelector('img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('alt')).toBe('')
    expect(image?.getAttribute('src')).toContain(encodeURIComponent(STORAGE_IMAGE))
  })

  it('外部ホスト・危険なスキームの画像は描画しない（閲覧者のIP漏洩を防ぐ）', () => {
    for (const src of [
      'https://attacker.example/px.gif',
      'javascript:alert(1)',
      'data:image/gif;base64,AA',
    ]) {
      const { container } = render(<PostBody doc={doc({ type: 'image', attrs: { src } })} />)
      expect(container.querySelector('img')).toBeNull()
    }
  })

  it('未知のノードは黙って捨てず、内側のテキストだけは残す', () => {
    render(<PostBody doc={doc({ type: 'table', content: [paragraph(text('表の中身'))] })} />)
    expect(screen.getByText('表の中身')).toBeInTheDocument()
  })

  it('異常に深くネストした本文でもスタックを溢れさせずに描画を打ち切る', () => {
    let deep: Record<string, unknown> = { type: 'paragraph', content: [text('最奥')] }
    for (let i = 0; i < 5000; i += 1) {
      deep = { type: 'blockquote', content: [deep] }
    }
    expect(() => render(<PostBody doc={doc(deep)} />)).not.toThrow()
    expect(screen.queryByText('最奥')).not.toBeInTheDocument()
  })

  it('doc でない値・壊れた値を渡しても落ちない', () => {
    const { container } = render(<PostBody doc={null} />)
    expect(container.querySelector('img')).toBeNull()
    render(<PostBody doc={{ type: 'doc', content: 'これは配列ではない' }} />)
  })
})
