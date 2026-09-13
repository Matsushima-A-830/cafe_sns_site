'use client'

import { useState } from 'react'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { textToTiptapDoc } from '@/lib/composer/tiptap'
import type { ComposerTag } from '@/types/composer'
import { AutosaveStatus } from './autosave-status'
import { CafePicker } from './cafe-picker'
import { ComposerHeader } from './composer-header'
import { ImagePicker } from './image-picker'
import { LeaveDialog } from './leave-dialog'
import { TagPicker } from './tag-picker'
import { useComposer } from './use-composer'
import { VisibilityField } from './visibility-field'

/** S_POST_SHORT: 写真＋短文。写真が1枚でもあれば本文なしで投稿できる */
export function ShortComposer({
  tags,
  suggestedTagIds,
}: {
  tags: ComposerTag[]
  suggestedTagIds: string[]
}) {
  const composer = useComposer('short')
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)

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
  const canSubmit = fields.images.length > 0 || fields.bodyText.trim().length > 0

  return (
    <div className="flex min-h-full flex-col">
      <ComposerHeader
        title="短文投稿"
        submitLabel="投稿する"
        canSubmit={canSubmit}
        isSubmitting={composer.isSubmitting}
        onCancel={() => (composer.isDirty ? setIsLeaveOpen(true) : void composer.discard())}
        onSubmit={() => void composer.submit()}
      />

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6">
        {composer.notice && (
          <p role="status" className="rounded-md bg-muted px-4 py-2 text-sm text-muted-foreground">
            {composer.notice}
          </p>
        )}

        <ImagePicker
          postId={composer.postId}
          images={fields.images}
          onChange={(images) => updateFields({ images })}
        />

        <CafePicker selected={fields.cafe} onSelect={(cafe) => updateFields({ cafe })} />

        <TagPicker
          tags={tags}
          suggestedTagIds={suggestedTagIds}
          selectedTagIds={fields.tagIds}
          onChange={(tagIds) => updateFields({ tagIds })}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="short-body">コメント</Label>
          <Textarea
            id="short-body"
            value={fields.bodyText}
            placeholder="ここに書いてください"
            onChange={(event) =>
              updateFields({
                bodyText: event.target.value,
                bodyJson: textToTiptapDoc(event.target.value),
              })
            }
          />
        </div>

        <VisibilityField
          value={fields.visibility}
          onChange={(visibility) => updateFields({ visibility })}
        />

        <AutosaveStatus state={composer.autosave} lastSavedAt={composer.lastSavedAt} />
        <FieldError>{composer.formError}</FieldError>
      </div>

      <LeaveDialog
        open={isLeaveOpen}
        onOpenChange={setIsLeaveOpen}
        onSaveAndLeave={() => void composer.saveAndLeave()}
        onDiscard={() => void composer.discard()}
      />
    </div>
  )
}
