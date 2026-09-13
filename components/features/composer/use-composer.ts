'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCafeById } from '@/app/_actions/cafes'
import { deleteDraft, getDraft, saveDraft } from '@/app/_actions/drafts'
import { createPost, getOwnPostStatus, reservePost } from '@/app/_actions/posts'
import { tiptapDocToText } from '@/lib/composer/tiptap'
import { getPostImagePublicUrl } from '@/lib/storage/post-images'
import { createClient } from '@/lib/supabase/browser'
import { errorMessage } from '@/lib/utils/error-messages'
import { DRAFT_PAYLOAD_VERSION, type DraftPayload } from '@/lib/validators/drafts'
import { extractPlainText } from '@/lib/validators/posts'
import type {
  AutosaveState,
  ComposerCafe,
  ComposerImage,
  PostType,
  PostVisibility,
} from '@/types/composer'

/** docs/design/wireframes/composer.md「自動保存は15秒デバウンス」 */
export const AUTOSAVE_DEBOUNCE_MS = 15_000

export type ComposerFields = {
  title: string
  bodyText: string
  bodyJson: Record<string, unknown>
  tagIds: string[]
  images: ComposerImage[]
  cafe: ComposerCafe | null
  visibility: PostVisibility
}

const emptyFields: ComposerFields = {
  title: '',
  bodyText: '',
  bodyJson: { type: 'doc', content: [] },
  tagIds: [],
  images: [],
  cafe: null,
  visibility: 'public',
}

/** 何も書かれていない下書きは保存しない（エントリシートの一覧がゴミで埋まるため） */
function isBlank(fields: ComposerFields): boolean {
  return (
    fields.title.trim().length === 0 &&
    extractPlainText(fields.bodyJson).trim().length === 0 &&
    fields.images.length === 0 &&
    fields.tagIds.length === 0 &&
    fields.cafe === null
  )
}

function toPayload(postId: string, postType: PostType, fields: ComposerFields): DraftPayload {
  return {
    v: DRAFT_PAYLOAD_VERSION,
    post_id: postId,
    post_type: postType,
    title: fields.title.trim().length > 0 ? fields.title : null,
    body_json: fields.bodyJson,
    tag_ids: fields.tagIds,
    image_paths: fields.images.map((image) => image.path),
    cafe_id: fields.cafe?.id ?? null,
  }
}

type InitStatus = 'loading' | 'ready' | 'error'

/**
 * composer（S_POST_SHORT / S_POST_BLOG）の共有ロジック。
 *
 * 画面表示の時点で reservePost を呼び、以降の画像アップロード・下書き保存・投稿確定は
 * すべて同じ postId を使い回す。下書きキーは URL の `?draft=` に載せ、リロードしても
 * 同じ予約行に戻れるようにする（docs/product/pending-items.md D17）
 */
export function useComposer(postType: PostType) {
  const router = useRouter()

  const [status, setStatus] = useState<InitStatus>('loading')
  const [postId, setPostId] = useState<string>()
  const [draftKey, setDraftKey] = useState<string>()
  const [fields, setFields] = useState<ComposerFields>(emptyFields)
  const [autosave, setAutosave] = useState<AutosaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const [formError, setFormError] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 「最後に保存した内容から変わったか」を版数で持つ。個々のフィールドを比較するより
  // 追加・削除に強く、自動保存とリロード警告の両方から同じ判定を使える
  const [revision, setRevision] = useState(0)
  const [savedRevision, setSavedRevision] = useState(0)
  const isDirty = revision !== savedRevision

  // 開発時の StrictMode は effect を2回走らせる。ガード無しでは reservePost が
  // 2回呼ばれて放置予約行（D19）が毎回1件増える
  const initStarted = useRef(false)
  // isSubmitting（state）は同じティック内の2回目の呼び出しからは false のまま見える。
  // ダブルタップで createPost が2本走るのを防ぐのはこの ref の役目
  const isSubmittingRef = useRef(false)
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const updateFields = useCallback((patch: Partial<ComposerFields>) => {
    setFields((prev) => ({ ...prev, ...patch }))
    setRevision((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true
    let cancelled = false

    const startNew = async () => {
      const reserved = await reservePost({ postType })
      if (cancelled) return
      if (!reserved.ok) {
        setFormError(errorMessage(reserved.error))
        setStatus('error')
        return
      }
      const key = crypto.randomUUID()
      setPostId(reserved.data.postId)
      setDraftKey(key)
      setStatus('ready')
      // 下書き行は最初の自動保存まで作られない。それでもキーを URL に載せておけば、
      // 保存後のリロード・戻る操作で同じ下書きに復帰できる
      const url = new URL(window.location.href)
      url.searchParams.set('draft', key)
      window.history.replaceState(null, '', url.toString())
    }

    const resume = async (key: string) => {
      const result = await getDraft({ clientDraftKey: key })
      if (cancelled) return false
      if (!result.ok) return false
      if (result.data.stale) {
        setNotice('以前の形式で保存された下書きは読み込めませんでした。新しく書き始めます。')
        return false
      }
      const payload = result.data.payload
      // 形式が違う下書き（short のキーで /new/blog を開く等）は復元しない
      if (payload.post_type !== postType) return false

      const supabase = createClient()
      const cafe = payload.cafe_id ? await getCafeById({ cafeId: payload.cafe_id }) : null
      if (cancelled) return false

      setPostId(payload.post_id)
      setDraftKey(key)
      setLastSavedAt(result.data.lastSavedAt)
      setFields({
        title: payload.title ?? '',
        bodyText: tiptapDocToText(payload.body_json),
        bodyJson: payload.body_json,
        tagIds: payload.tag_ids,
        images: payload.image_paths.map((path) => ({
          path,
          previewUrl: getPostImagePublicUrl(supabase, path),
        })),
        cafe: cafe?.ok ? cafe.data : null,
        visibility: 'public',
      })
      setAutosave('saved')
      setStatus('ready')
      return true
    }

    const init = async () => {
      const key = new URL(window.location.href).searchParams.get('draft')
      if (key && (await resume(key))) return
      if (!cancelled) await startNew()
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [postType])

  const persistDraft = useCallback(async (): Promise<boolean> => {
    const current = fieldsRef.current
    if (!postId || !draftKey || isBlank(current)) return false

    const revisionAtSave = revision
    setAutosave('saving')
    const result = await saveDraft({
      clientDraftKey: draftKey,
      payload: toPayload(postId, postType, current),
    })
    if (!result.ok) {
      setAutosave('error')
      return false
    }
    setSavedRevision(revisionAtSave)
    setLastSavedAt(result.data.lastSavedAt)
    setAutosave('saved')
    return true
  }, [draftKey, postId, postType, revision])

  // 15秒デバウンス。fields が変わるたびにタイマーを張り直す
  useEffect(() => {
    if (status !== 'ready' || !isDirty) return
    const timer = setTimeout(() => void persistDraft(), AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [status, isDirty, persistDraft])

  // タブを閉じる・リロードする経路での取りこぼしを防ぐ。アプリ内のキャンセル操作は
  // 離脱ダイアログ（LeaveDialog）が受け持つ
  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const finish = useCallback(async () => {
    if (draftKey) await deleteDraft({ clientDraftKey: draftKey })
    router.replace(`/new/success?postId=${postId}`)
  }, [draftKey, postId, router])

  const submit = useCallback(async () => {
    if (!postId || isSubmittingRef.current) return
    isSubmittingRef.current = true
    setIsSubmitting(true)
    setFormError(undefined)

    const current = fieldsRef.current
    const result = await createPost({
      postId,
      postType,
      ...(postType === 'blog' ? { title: current.title } : {}),
      bodyJson: current.bodyJson,
      cafeId: current.cafe?.id,
      tagIds: current.tagIds,
      imagePaths: current.images.map((image) => image.path),
      visibility: current.visibility,
    })

    if (result.ok) {
      await finish()
      return
    }

    // finalize_post の行ロックにより、二重送信の後着は「既に公開済みの行」への
    // finalize となって FORBIDDEN を受け取る。published なら先着が成功しているので
    // ユーザーにはエラーを見せない（docs/product/pending-items.md D17）
    if (result.error === 'FORBIDDEN') {
      const existing = await getOwnPostStatus({ postId })
      if (existing.ok && existing.data.status === 'published') {
        await finish()
        return
      }
    }

    isSubmittingRef.current = false
    setIsSubmitting(false)
    setFormError(errorMessage(result.error))
  }, [finish, postId, postType])

  const discard = useCallback(async () => {
    // 予約行と Storage の画像はここでは消さない。放置分の掃除は D19 でまとめて扱う
    if (draftKey) await deleteDraft({ clientDraftKey: draftKey })
    setSavedRevision(revision)
    router.push('/')
  }, [draftKey, revision, router])

  const saveAndLeave = useCallback(async () => {
    await persistDraft()
    setSavedRevision(revision)
    router.push('/')
  }, [persistDraft, revision, router])

  return {
    status,
    postId,
    fields,
    updateFields,
    autosave,
    lastSavedAt,
    isDirty,
    notice,
    formError,
    setFormError,
    isSubmitting,
    persistDraft,
    submit,
    discard,
    saveAndLeave,
  }
}
