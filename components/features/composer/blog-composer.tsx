'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { extractPlainText } from '@/lib/validators/posts'
import type { ComposerTag } from '@/types/composer'
import { AutosaveStatus } from './autosave-status'
import { CafePicker } from './cafe-picker'
import { ComposerHeader } from './composer-header'
import { LeaveDialog } from './leave-dialog'
import { TagPicker } from './tag-picker'
import { TiptapEditor } from './tiptap-editor'
import { useComposer } from './use-composer'
import { VisibilityField } from './visibility-field'

const TITLE_MAX_LENGTH = 100

/**
 * S_POST_BLOG: タイトル + Tiptap本文。
 * モバイルは1カラム、lg 以上は「左: 設定サイドバー / 右: 本文エディタ」の2カラム
 *   docs/design/wireframes/composer.md S_POST_BLOG
 */
export function BlogComposer({
  tags,
  suggestedTagIds,
}: {
  tags: ComposerTag[]
  suggestedTagIds: string[]
}) {
  const composer = useComposer('blog')
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [leaveError, setLeaveError] = useState<string>()

  const onSaveAndLeave = async () => {
    setLeaveError(undefined)
    const left = await composer.saveAndLeave()
    if (!left) setLeaveError('下書きを保存できませんでした。通信状況を確認してください')
  }

  if (composer.status === 'loading') {
    return (
      <p aria-busy="true" className="p-8 text-center text-muted-foreground">
        準備しています...
      </p>
    )
  }

  if (composer.status === 'error' || !composer.postId) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <FieldError>{composer.formError ?? '投稿の準備に失敗しました'}</FieldError>
      </div>
    )
  }

  const { fields, updateFields } = composer
  const canSubmit =
    fields.title.trim().length > 0 && extractPlainText(fields.bodyJson).trim().length > 0

  return (
    <div className="flex min-h-full flex-col">
      <ComposerHeader
        title="ブログ投稿"
        submitLabel="公開する"
        canSubmit={canSubmit}
        isSubmitting={composer.isSubmitting}
        onCancel={() => (composer.isDirty ? setIsLeaveOpen(true) : composer.leave())}
        onSubmit={() => void composer.submit()}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={composer.autosave === 'saving'}
          onClick={() => void composer.persistDraft()}
        >
          下書き保存
        </Button>
      </ComposerHeader>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
        <div className="flex w-full flex-col gap-6 lg:w-80 lg:shrink-0">
          {composer.notice && (
            <p
              role="status"
              className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground"
            >
              {composer.notice}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-title">タイトル</Label>
            <Input
              id="blog-title"
              value={fields.title}
              maxLength={TITLE_MAX_LENGTH}
              placeholder="例: 雨の日にこもれる表参道の喫茶店"
              onChange={(event) => updateFields({ title: event.target.value })}
            />
            <p className="text-sm text-muted-foreground">
              {fields.title.length} / {TITLE_MAX_LENGTH}
            </p>
          </div>

          <CafePicker selected={fields.cafe} onSelect={(cafe) => updateFields({ cafe })} />

          <TagPicker
            tags={tags}
            suggestedTagIds={suggestedTagIds}
            selectedTagIds={fields.tagIds}
            onChange={(tagIds) => updateFields({ tagIds })}
          />

          <VisibilityField
            value={fields.visibility}
            onChange={(visibility) => updateFields({ visibility })}
          />

          <AutosaveStatus state={composer.autosave} lastSavedAt={composer.lastSavedAt} />
          <FieldError>{composer.formError}</FieldError>
        </div>

        <div className="flex w-full flex-col gap-2 lg:flex-1">
          <TiptapEditor
            postId={composer.postId}
            initialContent={fields.bodyJson}
            onChange={(bodyJson) => updateFields({ bodyJson })}
          />
        </div>
      </div>

      <LeaveDialog
        open={isLeaveOpen}
        onOpenChange={setIsLeaveOpen}
        isBusy={composer.autosave === 'saving'}
        error={leaveError}
        onSaveAndLeave={() => void onSaveAndLeave()}
        onDiscard={() => void composer.discard()}
      />
    </div>
  )
}
