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
/** 保存に失敗したあとの再試行間隔。通信断が続く間に叩き続けないよう通常より長くする */
export const AUTOSAVE_RETRY_MS = 30_000

export type ComposerFields = {
  title: string
  bodyText: string
  bodyJson: Record<string, unknown>
  tagIds: string[]
  images: ComposerImage[]
  cafe: ComposerCafe | null
  visibility: PostVisibility
}

/** saved=保存した / skipped=保存するものが無い / failed=保存に失敗した */
export type PersistResult = 'saved' | 'skipped' | 'failed'

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

/** TiptapEditor の editor.getJSON() が返す node attrs は Object.create(null) ベースで
 * プロトタイプを持たず、Server Actions（React Flight）がプレーンオブジェクトと
 * 認識できず無言で欠落する（image の src が消える）。Server Action へ渡す直前に
 * JSON往復でプレーンオブジェクト化する（D34）。本文編集のたびには走らせたくないため、
 * 呼び出し頻度の低い自動保存・投稿確定の直前のみで行う */
function toPlainBodyJson(bodyJson: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(bodyJson))
}

function toPayload(postId: string, postType: PostType, fields: ComposerFields): DraftPayload {
  return {
    v: DRAFT_PAYLOAD_VERSION,
    post_id: postId,
    post_type: postType,
    title: fields.title.trim().length > 0 ? fields.title : null,
    body_json: toPlainBodyJson(fields.bodyJson),
    tag_ids: fields.tagIds,
    image_paths: fields.images.map((image) => image.path),
    cafe_id: fields.cafe?.id ?? null,
    visibility: fields.visibility,
  }
}

type InitStatus = 'loading' | 'ready' | 'error'
type FieldsPatch = Partial<ComposerFields> | ((prev: ComposerFields) => Partial<ComposerFields>)

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

  // 初期化は1回だけ。ここで cancelled フラグを併用して「cleanup で進行中の初期化を捨てる」
  // 形にすると、StrictMode（effect → cleanup → effect）では1回目の初期化が捨てられ、
  // 2回目はこのガードで即 return するため status が loading から進まなくなる。
  // 擬似アンマウントでもコンポーネントは同じインスタンスなので、遅れて届く setState は反映してよい
  const initStarted = useRef(false)
  // isSubmitting（state）は同じティック内の2回目の呼び出しからは false のまま見える。
  // ダブルタップで createPost が2本走るのを防ぐのはこの ref の役目
  const isSubmittingRef = useRef(false)
  // 自動保存のリトライと「下書き保存」ボタンが重なっても saveDraft を多重に投げない
  const isPersistingRef = useRef(false)
  // 一度でも下書き行を作ったか。作ったあとは「全部消した」状態も保存する必要がある
  // （空だからと skip すると、サーバー側に古い本文が残り、再開時に復活する）
  const hasSavedDraftRef = useRef(false)
  const fieldsRef = useRef(fields)
  fieldsRef.current = fields

  const updateFields = useCallback((patch: FieldsPatch) => {
    setFields((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
    setRevision((prev) => prev + 1)
  }, [])

  useEffect(() => {
    if (initStarted.current) return
    initStarted.current = true

    const startNew = async () => {
      const reserved = await reservePost({ postType })
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

      hasSavedDraftRef.current = true
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
        visibility: payload.visibility,
      })
      setAutosave('saved')
      setStatus('ready')
      return true
    }

    const init = async () => {
      const key = new URL(window.location.href).searchParams.get('draft')
      if (key && (await resume(key))) return
      await startNew()
    }

    void init()
  }, [postType])

  const persistDraft = useCallback(async (): Promise<PersistResult> => {
    // 投稿確定中は下書きを書き戻さない。finish() の deleteDraft のあとに自動保存が
    // 着地すると、公開済みの postId を持つ下書きが復活する。それを再開して書き直すと
    // finalize_post は FORBIDDEN → getOwnPostStatus は published を返し、
    // 「二重送信の後着」と誤判定して書き直した内容が黙って消える
    if (isSubmittingRef.current) return 'skipped'

    const current = fieldsRef.current
    if (!postId || !draftKey) return 'skipped'
    // まだ下書き行が無いうちは空の下書きを作らない（一覧がゴミで埋まる）。
    // 既にあるなら空の内容もそのまま書き戻す
    if (isBlank(current) && !hasSavedDraftRef.current) return 'skipped'
    if (isPersistingRef.current) return 'skipped'

    isPersistingRef.current = true
    const revisionAtSave = revision
    setAutosave('saving')
    const result = await saveDraft({
      clientDraftKey: draftKey,
      payload: toPayload(postId, postType, current),
    })
    isPersistingRef.current = false

    if (!result.ok) {
      setAutosave('error')
      return 'failed'
    }
    hasSavedDraftRef.current = true
    setSavedRevision(revisionAtSave)
    setLastSavedAt(result.data.lastSavedAt)
    setAutosave('saved')
    return 'saved'
  }, [draftKey, postId, postType, revision])

  // 15秒デバウンス。fields が変わるたびにタイマーを張り直す。
  // 直前の保存が失敗していたら、入力が止まったままでも未保存の変更が残っている限り
  // 再試行する（失敗して以降まったく保存されない状態を作らない）
  useEffect(() => {
    if (status !== 'ready' || !isDirty) return
    const delay = autosave === 'error' ? AUTOSAVE_RETRY_MS : AUTOSAVE_DEBOUNCE_MS
    const timer = setTimeout(() => void persistDraft(), delay)
    return () => clearTimeout(timer)
  }, [status, isDirty, persistDraft, autosave])

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
      bodyJson: toPlainBodyJson(current.bodyJson),
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

  /** 下書きを残したまま離れる。未編集でキャンセルしたときの既定の経路 */
  const leave = useCallback(() => {
    setSavedRevision(revision)
    router.push('/')
  }, [revision, router])

  /** 明示的な「下書きを破棄する」専用。予約行と Storage の画像は残す（掃除は D19） */
  const discard = useCallback(async () => {
    if (draftKey) await deleteDraft({ clientDraftKey: draftKey })
    setSavedRevision(revision)
    router.push('/')
  }, [draftKey, revision, router])

  /**
   * 保存できたときだけ離脱する。失敗したまま遷移すると beforeunload の警告も外れ、
   * 入力がそのまま失われる。戻り値の false は呼び出し側（離脱ダイアログ）が表示に使う
   */
  const saveAndLeave = useCallback(async (): Promise<boolean> => {
    const result = await persistDraft()
    if (result === 'failed') return false
    setSavedRevision(revision)
    router.push('/')
    return true
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
    leave,
    discard,
    saveAndLeave,
  }
}
