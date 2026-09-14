'use client'

import { PostBody } from '@/components/features/posts/post-body'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * ブログ本文のプレビュー。描画は投稿詳細（S_POST_DETAIL）と同じ PostBody を使い、
 * 「プレビューでは出るのに公開したら崩れる」を構造的に起こさない
 *   docs/product/pending-items.md D21
 */
export function PreviewDialog({
  open,
  onOpenChange,
  title,
  bodyJson,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  bodyJson: unknown
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="md:max-w-[720px]">
        <DialogTitle>{title.trim() || 'タイトル未入力'}</DialogTitle>
        <PostBody doc={bodyJson} />
      </DialogContent>
    </Dialog>
  )
}
