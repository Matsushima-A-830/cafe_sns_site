'use client'

import { Button } from '@/components/ui/button'

/**
 * composer 共通のヘッダ。左にキャンセル、右に確定操作を固定で置き、
 * スクロールしても「投稿する」を見失わないようにする
 *   docs/design/wireframes/composer.md
 */
export function ComposerHeader({
  title,
  submitLabel,
  canSubmit,
  isSubmitting,
  onCancel,
  onSubmit,
  children,
}: {
  title: string
  submitLabel: string
  canSubmit: boolean
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: () => void
  children?: React.ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border-default bg-surface">
      <div className="mx-auto flex max-w-[720px] items-center justify-between gap-4 px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          キャンセル
        </Button>
        <h1 className="text-base font-bold text-foreground">{title}</h1>
        <Button type="button" size="sm" disabled={!canSubmit || isSubmitting} onClick={onSubmit}>
          {isSubmitting ? '送信中...' : submitLabel}
        </Button>
      </div>
      {children && (
        <div className="mx-auto flex max-w-[720px] items-center justify-end gap-2 px-4 pb-2">
          {children}
        </div>
      )}
    </header>
  )
}
