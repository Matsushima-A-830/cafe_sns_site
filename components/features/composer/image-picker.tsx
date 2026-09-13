'use client'

import { ImagePlusIcon, Loader2Icon, XIcon } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import { FieldError } from '@/components/ui/field-error'
import { uploadPostImage } from '@/lib/storage/post-image-client'
import { POST_IMAGE_MAX_COUNT } from '@/lib/storage/post-images'
import { errorMessage } from '@/lib/utils/error-messages'
import type { ComposerImage } from '@/types/composer'

/**
 * 写真の選択・アップロード。選択した時点で EXIF を剥がして Storage に置き、
 * 以降は storage_path だけを持ち回る（投稿確定・下書き保存の両方で同じパスを使う）
 *   docs/design/wireframes/composer.md S_POST_SHORT
 */
export function ImagePicker({
  postId,
  images,
  onChange,
  disabled,
}: {
  postId: string
  images: ComposerImage[]
  /** アップロード完了は await を跨ぐため、props の images ではなく直前の値から更新する */
  onChange: (update: (prev: ComposerImage[]) => ComposerImage[]) => void
  disabled?: boolean
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // 枚数ではなく id の配列で持つ。プレースホルダに安定したキーを与えるため
  const [uploadingIds, setUploadingIds] = useState<string[]>([])
  const [error, setError] = useState<string>()

  const remaining = POST_IMAGE_MAX_COUNT - images.length - uploadingIds.length

  // このコンポーネントが作った object URL。投稿確定・画面離脱まで解放されないと
  // 変換後 Blob（数MB×最大10枚）がそのままメモリに残る
  const createdUrls = useRef<string[]>([])
  useEffect(() => {
    const urls = createdUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  const onSelect = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setError(undefined)
    const files = Array.from(fileList).slice(0, Math.max(0, remaining))
    if (files.length < fileList.length) {
      setError(`写真は${POST_IMAGE_MAX_COUNT}枚までです`)
    }
    // 同じファイルを選び直せるよう、読み取り後すぐ input を空に戻す
    if (inputRef.current) inputRef.current.value = ''
    if (files.length === 0) return

    const pending = files.map(() => crypto.randomUUID())
    setUploadingIds((ids) => [...ids, ...pending])
    // 1枚ずつ確定させる。並列にすると署名APIの10枚チェックが同時に走り、
    // 上限を超えた枚数ぶん署名が出てしまう
    for (const [index, file] of files.entries()) {
      const result = await uploadPostImage(postId, file)
      setUploadingIds((ids) => ids.filter((id) => id !== pending[index]))
      if (!result.ok) {
        setError(errorMessage(result.error))
        continue
      }
      // プレビューは変換後の WebP から作る。元ファイルの object URL だと iPhone の HEIC が
      // Chrome / Firefox で描画できず、アップロードは成功したのにプレビューだけ壊れる
      const previewUrl = URL.createObjectURL(result.data.blob)
      createdUrls.current.push(previewUrl)
      onChange((prev) => [...prev, { path: result.data.path, previewUrl }])
    }
  }

  const remove = (target: ComposerImage) => {
    // 選択直後のプレビューは createObjectURL 由来。破棄しないとページを離れるまで
    // Blob がメモリに残る（下書き再開時の公開URLは対象外）
    if (target.previewUrl.startsWith('blob:')) URL.revokeObjectURL(target.previewUrl)
    onChange((prev) => prev.filter((item) => item.path !== target.path))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {images.map((image, index) => (
          <div
            key={image.path}
            className="relative size-24 overflow-hidden rounded-md border border-border-default"
          >
            <Image
              src={image.previewUrl}
              alt={`選択した写真 ${index + 1}枚目`}
              fill
              sizes="96px"
              className="object-cover"
              unoptimized={image.previewUrl.startsWith('blob:')}
            />
            <button
              type="button"
              onClick={() => remove(image)}
              className="absolute top-1 right-1 rounded-full bg-brown-900/70 p-1 text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none"
            >
              <XIcon className="size-3" />
              <span className="sr-only">{index + 1}枚目の写真を削除</span>
            </button>
          </div>
        ))}

        {uploadingIds.map((id) => (
          <div
            key={id}
            className="flex size-24 items-center justify-center rounded-md border border-dashed border-border-strong text-muted-foreground"
          >
            <Loader2Icon className="size-6 animate-spin motion-reduce:animate-none" />
            <span className="sr-only">写真をアップロード中</span>
          </div>
        ))}

        {remaining > 0 && (
          <label
            htmlFor={inputId}
            className="flex size-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong text-sm text-muted-foreground hover:bg-muted focus-within:ring-2 focus-within:ring-ring-focus"
          >
            <ImagePlusIcon className="size-6" />
            追加
          </label>
        )}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={(event) => void onSelect(event.target.files)}
      />

      <p className="text-sm text-muted-foreground">
        ※ 位置情報（EXIF）は自動で削除されます・最大{POST_IMAGE_MAX_COUNT}枚
      </p>
      <FieldError>{error}</FieldError>
    </div>
  )
}
