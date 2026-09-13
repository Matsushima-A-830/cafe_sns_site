'use client'

import { FileTextIcon, ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import type { DraftSummary, LoadedDraft } from '@/app/_actions/drafts'
import { Button } from '@/components/ui/button'
import { tiptapDocToText } from '@/lib/composer/tiptap'

const FORMATS = [
  {
    href: '/new/short',
    icon: ImageIcon,
    title: '写真＋短文',
    description: '1〜10枚 + 短いコメント',
  },
  {
    href: '/new/blog',
    icon: FileTextIcon,
    title: 'ブログ',
    description: 'タイトル + 本文で詳しく',
  },
] as const

const PREVIEW_MAX_CHARS = 40

function draftLabel(draft: LoadedDraft): string {
  const body = tiptapDocToText(draft.payload.body_json).trim()
  const text = draft.payload.title?.trim() || body || '（本文なし）'
  return text.length > PREVIEW_MAX_CHARS ? `${text.slice(0, PREVIEW_MAX_CHARS)}…` : text
}

function draftHref(draft: LoadedDraft): string {
  const path = draft.payload.post_type === 'blog' ? '/new/blog' : '/new/short'
  return `${path}?draft=${encodeURIComponent(draft.clientDraftKey)}`
}

/**
 * 投稿形式の選択。下書きがあれば「続きを書く」導線を併せて出す（損失回避）
 *   docs/design/wireframes/composer.md
 */
export function EntrySheet({ drafts }: { drafts: DraftSummary[] }) {
  const [showDrafts, setShowDrafts] = useState(false)
  // 形式不明（バージョン不一致）の下書きは再開できないので導線に出さない
  const resumable = drafts.filter((draft): draft is LoadedDraft => !draft.stale)

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-4 py-8">
      <h1 className="text-center text-2xl font-bold text-foreground">何を投稿しますか？</h1>

      <div className="flex flex-col gap-4">
        {FORMATS.map((format) => (
          <Link
            key={format.href}
            href={format.href}
            className="flex items-center gap-4 rounded-lg border border-border-default bg-surface p-6 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
          >
            <format.icon className="size-6 text-primary" aria-hidden="true" />
            <span className="flex flex-col gap-1">
              <span className="font-medium text-foreground">{format.title}</span>
              <span className="text-sm text-muted-foreground">{format.description}</span>
            </span>
          </Link>
        ))}
      </div>

      {resumable.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-muted p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">下書きが{resumable.length}件あります</p>
            <Button
              type="button"
              variant="link"
              size="sm"
              aria-expanded={showDrafts}
              onClick={() => setShowDrafts((prev) => !prev)}
            >
              {showDrafts ? '閉じる' : '続きを書く ▶'}
            </Button>
          </div>

          {showDrafts && (
            <ul className="flex flex-col gap-2">
              {resumable.map((draft) => (
                <li key={draft.clientDraftKey}>
                  <Link
                    href={draftHref(draft)}
                    className="flex flex-col gap-1 rounded-md bg-surface px-4 py-2 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
                  >
                    <span className="text-sm text-foreground">{draftLabel(draft)}</span>
                    <span className="text-xs text-muted-foreground">
                      {draft.payload.post_type === 'blog' ? 'ブログ' : '短文'} ・{' '}
                      {new Date(draft.lastSavedAt).toLocaleString('ja-JP')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Button asChild variant="ghost" size="lg">
        <Link href="/">キャンセル</Link>
      </Button>
    </div>
  )
}
