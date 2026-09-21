'use client'

import { useState } from 'react'
import { createOfficialPost } from '@/app/_actions/posts-official'
import { ComposerHeader } from '@/components/features/composer/composer-header'
import { ImagePicker } from '@/components/features/composer/image-picker'
import { useOfficialComposer } from '@/components/features/composer/use-official-composer'
import { OfficialSummary } from '@/components/features/posts/official-badge'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { textToTiptapDoc } from '@/lib/composer/tiptap'
import type { ComposerImage } from '@/types/composer'

/** S_POST_OFFICIAL 新メニュー（new_menu）。写真1〜3枚推奨 */
export function NewMenuForm() {
  const composer = useOfficialComposer('new_menu')
  const [images, setImages] = useState<ComposerImage[]>([])
  const [menuName, setMenuName] = useState('')
  const [price, setPrice] = useState('')
  const [availableFrom, setAvailableFrom] = useState('')
  const [description, setDescription] = useState('')

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
  const canSubmit = menuName.trim().length > 0 && availableFrom.length > 0
  const priceYen = price.trim() === '' ? null : Number(price)

  async function handleSubmit() {
    await composer.submit(() =>
      createOfficialPost({
        officialFormat: 'new_menu',
        postId,
        bodyJson: textToTiptapDoc(description),
        imagePaths: images.map((image) => image.path),
        metadata: {
          v: 1,
          menu_name: menuName.trim(),
          price_yen: priceYen,
          available_from: availableFrom,
        },
      }),
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <ComposerHeader
        title="新メニュー"
        submitLabel="投稿する"
        canSubmit={canSubmit}
        isSubmitting={composer.isSubmitting}
        onCancel={() => history.back()}
        onSubmit={() => void handleSubmit()}
      />

      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-4 py-6">
        <div className="flex flex-col gap-2">
          <Label>写真（1〜3枚）</Label>
          <ImagePicker
            postId={postId}
            images={images}
            onChange={(update) => setImages((prev) => update(prev))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-menu-name">メニュー名</Label>
          <Input
            id="new-menu-name"
            value={menuName}
            maxLength={60}
            placeholder="例: 秋の限定ブレンド"
            onChange={(event) => setMenuName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-menu-price">価格</Label>
          <Input
            id="new-menu-price"
            type="number"
            inputMode="numeric"
            min={0}
            value={price}
            placeholder="¥"
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-menu-available-from">提供開始日</Label>
          <Input
            id="new-menu-available-from"
            type="date"
            value={availableFrom}
            onChange={(event) => setAvailableFrom(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-menu-description">説明</Label>
          <Textarea
            id="new-menu-description"
            value={description}
            maxLength={400}
            placeholder="秋の味覚を..."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        {menuName.trim() && availableFrom && (
          <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface p-4">
            <p className="text-sm text-muted-foreground">プレビュー</p>
            <OfficialSummary
              metadata={{
                format: 'new_menu',
                menuName: menuName.trim(),
                priceYen,
                availableFrom,
              }}
            />
          </div>
        )}

        <FieldError>{composer.formError}</FieldError>
      </div>
    </div>
  )
}
