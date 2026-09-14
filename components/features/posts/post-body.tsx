import Image from 'next/image'
import { isStoragePublicUrl } from '@/lib/storage/public-url'
import { cn } from '@/lib/utils/cn'
import { safeHttpUrl } from '@/lib/utils/safe-url'
import { RICH_TEXT_CLASS } from './rich-text'

/**
 * Tiptap JSON を React 要素へ再帰変換する。投稿詳細（S_POST_DETAIL）と
 * composer のプレビュー（pending-items D21）の両方がこれを使う。
 *
 * generateHTML() + dangerouslySetInnerHTML は使わない。本文を HTML ではなく JSON で
 * 保存しているのは XSS 対策が目的で、HTML 文字列に戻した時点でその前提が崩れる
 *   docs/design/wireframes/composer.md
 */

type TiptapNode = Record<string, unknown>

/** composer（StarterKit + Image + Link）が生成し得るノード。Markdown 入力ショートカット
 *  経由でしか作れない codeBlock / horizontalRule / strike / code も含む */
const KNOWN_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'image',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'hardBreak',
  'horizontalRule',
  'codeBlock',
])

/** 再帰の深さ上限。lib/validators/posts.ts extractPlainText と同じ趣旨で、
 *  API 直叩きで作られた異常に深い本文がスタックオーバーフローを起こすのを防ぐ。
 *  超えた分は描画しない（Tiptap が作る文書がこの深さに達することはない） */
const MAX_NODE_DEPTH = 64

/** 本文埋め込み画像の next/image 用サイズ。実寸は保持していない（post_images も
 *  width/height を埋めていない）ため、記事幅の比率ヒントとして渡し表示は CSS 側に任せる */
const EMBEDDED_IMAGE_WIDTH = 1200
const EMBEDDED_IMAGE_HEIGHT = 800

function isRecord(value: unknown): value is TiptapNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function childNodes(node: TiptapNode): unknown[] {
  return Array.isArray(node.content) ? node.content : []
}

function attrs(node: TiptapNode): Record<string, unknown> {
  return isRecord(node.attrs) ? node.attrs : {}
}

/** ページ側の h1 と競合させないため、本文の見出しは h2〜h3 に丸める */
function headingTag(level: unknown): 'h2' | 'h3' {
  return level === 3 || (typeof level === 'number' && level > 3) ? 'h3' : 'h2'
}

function renderText(node: TiptapNode, key: string): React.ReactNode {
  const value = node.text
  if (typeof value !== 'string') return null

  const marks = Array.isArray(node.marks) ? node.marks : []
  let rendered: React.ReactNode = value

  for (const mark of marks) {
    if (!isRecord(mark)) continue
    switch (mark.type) {
      case 'bold':
        rendered = <strong>{rendered}</strong>
        break
      case 'italic':
        rendered = <em>{rendered}</em>
        break
      case 'strike':
        rendered = <s>{rendered}</s>
        break
      case 'code':
        rendered = <code>{rendered}</code>
        break
      case 'link': {
        const href = safeHttpUrl(isRecord(mark.attrs) ? mark.attrs.href : null)
        // 危険なスキームのリンクはマークだけ落とし、文字自体は残す（本文が欠けない）
        if (href) {
          rendered = (
            <a href={href} target="_blank" rel="nofollow noopener noreferrer">
              {rendered}
            </a>
          )
        }
        break
      }
      default:
        warnUnknown(`mark:${String(mark.type)}`)
    }
  }

  return <span key={key}>{rendered}</span>
}

/** 本番では黙って素通りさせるが、開発時はログに出して気付けるようにする */
function warnBody(message: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[PostBody] ${message}`)
  }
}

function warnUnknown(label: string): void {
  warnBody(`未対応の Tiptap ノードです: ${label}`)
}

function renderNodes(nodes: unknown[], keyPrefix: string, depth: number): React.ReactNode[] {
  return nodes.map((node, index) => renderNode(node, `${keyPrefix}-${index}`, depth))
}

function renderNode(value: unknown, key: string, depth: number): React.ReactNode {
  if (!isRecord(value)) return null
  if (depth > MAX_NODE_DEPTH) {
    warnBody(`ネストが深すぎるため深さ${MAX_NODE_DEPTH}で描画を打ち切りました`)
    return null
  }
  const node = value
  const children = renderNodes(childNodes(node), key, depth + 1)

  switch (node.type) {
    case 'text':
      return renderText(node, key)
    case 'paragraph':
      return <p key={key}>{children}</p>
    case 'heading': {
      const Tag = headingTag(attrs(node).level)
      return <Tag key={key}>{children}</Tag>
    }
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>
    case 'bulletList':
      return <ul key={key}>{children}</ul>
    case 'orderedList': {
      const start = attrs(node).start
      return (
        <ol key={key} start={typeof start === 'number' ? start : undefined}>
          {children}
        </ol>
      )
    }
    case 'listItem':
      return <li key={key}>{children}</li>
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      )
    case 'hardBreak':
      return <br key={key} />
    case 'horizontalRule':
      return <hr key={key} />
    case 'image': {
      // 自前の Storage の画像だけを出す。body_json は API 直叩きで書き換えられるため、
      // 外部ホストの src を許すと閲覧者全員のIP・UA・Referer がその host に渡る
      // （画像はすべて composer が post-images バケットへ上げたもののはず）
      const src = attrs(node).src
      if (typeof src !== 'string' || !isStoragePublicUrl(src)) {
        warnBody(`配信元が想定外の画像を描画しませんでした: ${String(src)}`)
        return null
      }
      const alt = attrs(node).alt
      return (
        <Image
          key={key}
          src={src}
          // 代替テキストの入力導線が無いため常に空（装飾扱い）になる
          //   docs/product/pending-items.md D22
          alt={typeof alt === 'string' ? alt : ''}
          width={EMBEDDED_IMAGE_WIDTH}
          height={EMBEDDED_IMAGE_HEIGHT}
          sizes="(min-width: 768px) 720px, 100vw"
          className="h-auto w-full"
        />
      )
    }
    default:
      // 子のテキストだけは拾う。未知ノードごと捨てると本文が無言で欠ける
      if (!KNOWN_NODE_TYPES.has(String(node.type))) warnUnknown(String(node.type))
      return <span key={key}>{children}</span>
  }
}

export function PostBody({ doc, className }: { doc: unknown; className?: string }) {
  if (!isRecord(doc)) return null

  return (
    <div className={cn('text-base text-foreground', RICH_TEXT_CLASS, className)}>
      {renderNodes(childNodes(doc), 'n', 0)}
    </div>
  )
}
