'use server'

import { POSTGRES_INSUFFICIENT_PRIVILEGE } from '@/lib/constants/postgres-error-codes'
import { createClient } from '@/lib/supabase/server'
import {
  type DraftPayload,
  draftKeySchema,
  draftPayloadSchema,
  saveDraftSchema,
} from '@/lib/validators/drafts'
import type { Json } from '@/types/database'
import type { Result } from '@/types/result'

type DraftError = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL_ERROR'
type GetDraftError = DraftError | 'NOT_FOUND'

/** payload がバージョン不一致・壊れている下書き。UIは「古い下書きは使えません」と案内する */
export type StaleDraft = {
  clientDraftKey: string
  lastSavedAt: string
  stale: true
}

export type LoadedDraft = {
  clientDraftKey: string
  lastSavedAt: string
  stale: false
  payload: DraftPayload
}

export type DraftSummary = StaleDraft | LoadedDraft

function toSummary(row: {
  client_draft_key: string
  last_saved_at: string
  payload: Json
}): DraftSummary {
  const parsed = draftPayloadSchema.safeParse(row.payload)
  if (!parsed.success) {
    return { clientDraftKey: row.client_draft_key, lastSavedAt: row.last_saved_at, stale: true }
  }
  return {
    clientDraftKey: row.client_draft_key,
    lastSavedAt: row.last_saved_at,
    stale: false,
    payload: parsed.data,
  }
}

/**
 * 15秒デバウンスの自動保存。`(author_id, client_draft_key)` の一意制約で upsert する。
 * last_saved_at / expires_at は drafts_refresh_saved_at トリガーが更新するため送らない
 *   supabase/migrations/20260907120300_create_drafts.sql
 */
export async function saveDraft(
  input: unknown,
): Promise<Result<{ lastSavedAt: string }, DraftError>> {
  const parsed = saveDraftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('drafts')
    .upsert(
      {
        author_id: user.id,
        client_draft_key: parsed.data.clientDraftKey,
        payload: parsed.data.payload as Json,
      },
      { onConflict: 'author_id,client_draft_key' },
    )
    .select('last_saved_at')
    .single()

  if (error) {
    // pending_consent / suspended は drafts_insert_own の is_active_user() で弾かれる
    if (error.code === POSTGRES_INSUFFICIENT_PRIVILEGE) return { ok: false, error: 'FORBIDDEN' }
    return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  }

  return { ok: true, data: { lastSavedAt: data.last_saved_at } }
}

/**
 * 下書き一覧（エントリシートの「続きを書く」・S_DRAFTS）。
 * 期限切れ削除は日次ジョブ待ち（pending-items A6）なので、取得時にも expires_at で絞る
 */
export async function listDrafts(): Promise<Result<DraftSummary[], DraftError>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('drafts')
    .select('client_draft_key, last_saved_at, payload')
    .gt('expires_at', new Date().toISOString())
    .order('last_saved_at', { ascending: false })

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }

  return { ok: true, data: data.map(toSummary) }
}

/** composer 再開時に1件だけ読む。RLS で他人の下書きは見えないため NOT_FOUND に落ちる */
export async function getDraft(input: unknown): Promise<Result<DraftSummary, GetDraftError>> {
  const parsed = draftKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data, error } = await supabase
    .from('drafts')
    .select('client_draft_key, last_saved_at, payload')
    .eq('client_draft_key', parsed.data.clientDraftKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  if (!data) return { ok: false, error: 'NOT_FOUND' }

  return { ok: true, data: toSummary(data) }
}

/** 投稿成功時・ユーザーが明示的に破棄したときに呼ぶ。存在しなくても成功扱いにする */
export async function deleteDraft(input: unknown): Promise<Result<null, DraftError>> {
  const parsed = draftKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { error } = await supabase
    .from('drafts')
    .delete()
    .eq('client_draft_key', parsed.data.clientDraftKey)

  if (error) return { ok: false, error: 'INTERNAL_ERROR', details: error.message }
  return { ok: true, data: null }
}
