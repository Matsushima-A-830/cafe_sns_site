'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'

/**
 * 離脱前ダイアログ。「破棄する」は目立たせず、既定の導線を「続けて書く」に寄せる
 * （破壊的操作には摩擦を、損失回避はUXに組み込む — docs/design/wireframes/composer.md）
 */
export function LeaveDialog({
  open,
  onOpenChange,
  onSaveAndLeave,
  onDiscard,
  isBusy,
  error,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaveAndLeave: () => void
  onDiscard: () => void
  isBusy?: boolean
  /** 保存に失敗したときはダイアログに留まり、ここに理由を出す */
  error?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>このまま離れますか？</DialogTitle>
        <DialogDescription>
          書きかけの内容は下書きとして保存できます。保存すると「＋
          投稿する」からいつでも続きを書けます。
        </DialogDescription>

        <FieldError>{error}</FieldError>

        <div className="flex flex-col gap-2">
          <Button type="button" size="lg" disabled={isBusy} onClick={() => onOpenChange(false)}>
            続けて書く
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={isBusy}
            onClick={onSaveAndLeave}
          >
            下書きに保存して離脱
          </Button>
          <Button type="button" variant="link" size="sm" disabled={isBusy} onClick={onDiscard}>
            下書きを破棄する
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
