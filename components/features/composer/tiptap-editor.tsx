'use client'

import ImageExtension from '@tiptap/extension-image'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  BoldIcon,
  ImagePlusIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { uploadPostImage } from '@/lib/storage/post-image-client'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils/cn'
import { errorMessage } from '@/lib/utils/error-messages'

/**
 * ブログ本文のエディタ。保存は Tiptap JSON 単一で、Markdown はあくまで入力ショートカット。
 * 下線・テーブル・色・フォント指定は意図的に外している（選択のパラドックス回避、
 * 下線はリンクと紛らわしい — docs/design/wireframes/composer.md S_POST_BLOG）
 */
export function TiptapEditor({
  postId,
  initialContent,
  onChange,
}: {
  postId: string
  initialContent: Record<string, unknown>
  onChange: (bodyJson: Record<string, unknown>) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  // null の間はリンク入力行を出さない。window.prompt はモバイルで扱いづらく、
  // 入力中に選択範囲も失われるため使わない
  const [linkDraft, setLinkDraft] = useState<string | null>(null)

  const editor = useEditor({
    // App Router の SSR と噛み合わせるため、初回描画はクライアントに任せる
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false,
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'nofollow noopener' } },
      }),
      ImageExtension.configure({ HTMLAttributes: { class: 'rounded-md' } }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        // Tailwind の preflight が見出し・リストの既定スタイルを消すため、
        // 編集中の見た目を投稿詳細の表示に寄せる最小限をここで当てる
        class: cn(
          'min-h-64 w-full px-4 py-4 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring-focus',
          '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-bold',
          '[&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-bold',
          '[&_p]:my-2 [&_a]:text-link [&_a]:underline',
          '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
          '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-default [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
          '[&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-md',
        ),
        'aria-label': '本文',
      },
    },
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as Record<string, unknown>),
  })

  if (!editor) {
    return (
      <div className="min-h-64 rounded-md border border-default bg-surface" aria-busy="true">
        <span className="sr-only">エディタを読み込んでいます</span>
      </div>
    )
  }

  const openLinkInput = () => {
    const previous = editor.getAttributes('link').href
    setLinkDraft(typeof previous === 'string' ? previous : 'https://')
    setError(undefined)
  }

  const applyLink = () => {
    const href = (linkDraft ?? '').trim()
    if (href.length === 0) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      setLinkDraft(null)
      return
    }
    // javascript: 等のスキームを弾く。Tiptap 側でも検証されるが、入口で落とす
    if (!/^https?:\/\//i.test(href)) {
      setError('リンクは http:// または https:// で始まるURLのみ使えます')
      return
    }
    setError(undefined)
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setLinkDraft(null)
  }

  const insertImage = async (file: File | undefined) => {
    if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    setError(undefined)
    const result = await uploadPostImage(postId, file)
    if (!result.ok) {
      setError(errorMessage(result.error))
      return
    }
    // 本文中の画像は公開URLを埋め込む。post_images への登録は写真欄（imagePaths）の
    // 責務なので、ここでは本文JSONにだけ載せる
    const src = getPostImagePublicUrl(createClient(), result.data.path)
    editor.chain().focus().setImage({ src, alt: file.name }).run()
  }

  const toolbarButton = (
    key: string,
    label: string,
    isActive: boolean,
    onClick: () => void,
    icon: React.ReactNode,
  ) => (
    <button
      key={key}
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        'rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none',
        isActive && 'bg-muted text-foreground',
      )}
    >
      {icon}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border border-default bg-surface">
        <div className="flex flex-wrap items-center gap-1 border-b border-default px-2 py-2">
          {toolbarButton(
            'bold',
            '太字',
            editor.isActive('bold'),
            () => editor.chain().focus().toggleBold().run(),
            <BoldIcon className="size-4" />,
          )}
          {toolbarButton(
            'italic',
            '斜体',
            editor.isActive('italic'),
            () => editor.chain().focus().toggleItalic().run(),
            <ItalicIcon className="size-4" />,
          )}
          {toolbarButton(
            'h2',
            '見出し（大）',
            editor.isActive('heading', { level: 2 }),
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            <span className="text-sm font-bold">H2</span>,
          )}
          {toolbarButton(
            'h3',
            '見出し（小）',
            editor.isActive('heading', { level: 3 }),
            () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
            <span className="text-sm font-bold">H3</span>,
          )}
          {toolbarButton(
            'link',
            'リンク',
            editor.isActive('link'),
            openLinkInput,
            <LinkIcon className="size-4" />,
          )}
          {toolbarButton(
            'quote',
            '引用',
            editor.isActive('blockquote'),
            () => editor.chain().focus().toggleBlockquote().run(),
            <QuoteIcon className="size-4" />,
          )}
          {toolbarButton(
            'bulletList',
            '箇条書き',
            editor.isActive('bulletList'),
            () => editor.chain().focus().toggleBulletList().run(),
            <ListIcon className="size-4" />,
          )}
          {toolbarButton(
            'orderedList',
            '番号付きリスト',
            editor.isActive('orderedList'),
            () => editor.chain().focus().toggleOrderedList().run(),
            <ListOrderedIcon className="size-4" />,
          )}
          {toolbarButton(
            'image',
            '画像を挿入',
            false,
            () => fileInputRef.current?.click(),
            <ImagePlusIcon className="size-4" />,
          )}
        </div>

        {linkDraft !== null && (
          <div className="flex flex-wrap items-center gap-2 border-b border-default px-2 py-2">
            <Input
              type="url"
              aria-label="リンク先のURL"
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              className="h-8 flex-1"
            />
            <Button type="button" size="sm" onClick={applyLink}>
              適用
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkDraft(null)}>
              キャンセル
            </Button>
          </div>
        )}

        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void insertImage(event.target.files?.[0])}
      />
      <FieldError>{error}</FieldError>
    </div>
  )
}
