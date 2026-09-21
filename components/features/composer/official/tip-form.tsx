'use client'

import { useState } from 'react'
import { createOfficialPost } from '@/app/_actions/posts-official'
import { ComposerHeader } from '@/components/features/composer/composer-header'
import { ImagePicker } from '@/components/features/composer/image-picker'
import { TiptapEditor } from '@/components/features/composer/tiptap-editor'
import { useOfficialComposer } from '@/components/features/composer/use-official-composer'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EMPTY_TIPTAP_DOC, extractPlainText } from '@/lib/validators/posts'
import type { ComposerImage } from '@/types/composer'

/** S_POST_OFFICIAL 豆知識（tip）。ブログ形式に近い長文可。写真は任意 */
export function TipForm() {
  const composer = useOfficialComposer('tip')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [title, setTitle] = useState('')
  const [bodyJson, setBodyJson] = useState<Record<string, unknown>>({ ...EMPTY_TIPTAP_DOC })

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

  const postId = composer.postId
  const canSubmit = title.trim().length > 0 && extractPlainText(bodyJson).trim().length > 0

  async function handleSubmit() {
    await composer.submit(() =>
      createOfficialPost({
        officialFormat: 'tip',
        postId,
        title: title.trim(),
        bodyJson,
        imagePaths: images.map((image) => image.path),
        metadata: { v: 1 },
      }),
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <ComposerHeader
        title="豆知識"
        submitLabel="投稿する"
        canSubmit={canSubmit}
        isSubmitting={composer.isSubmitting}
        onCancel={() => history.back()}
        onSubmit={() => void handleSubmit()}
      />

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-2">
          <Label>写真（任意）</Label>
          <ImagePicker
            postId={postId}
            images={images}
            onChange={(update) => setImages((prev) => update(prev))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tip-title">タイトル</Label>
          <Input
            id="tip-title"
            value={title}
            maxLength={100}
            placeholder="例: 当店の豆へのこだわり"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>本文</Label>
          <TiptapEditor postId={postId} initialContent={bodyJson} onChange={setBodyJson} />
        </div>

        <FieldError>{composer.formError}</FieldError>
      </div>
    </div>
  )
}
