'use server'

import { POSTGRES_UNIQUE_VIOLATION } from '@/lib/constants/postgres-error-codes'
import { reportError } from '@/lib/monitoring/report-error'
import { createClient } from '@/lib/supabase/server'
import {
  type AddNgWordInput,
  addNgWordSchema,
  deleteNgWordSchema,
} from '@/lib/validators/admin-ng-words'
import type { Result } from '@/types/result'

/**
 * S_ADMIN_NG_WORDS。requireAdmin は admin-reports.ts と同じ形（role='admin' かつ
 * status='active'）。2箇所目の重複だが、3回目が出るまでは抽象化しない
 * （CLAUDE.md 開発哲学「過剰設計を避ける」）
 *   docs/architecture/data-model/tables.md #ng_words
 */

type AdminGuardError = 'UNAUTHENTICATED' | 'FORBIDDEN'
type Client = Awaited<ReturnType<typeof createClient>>

async function requireAdmin(supabase: Client): Promise<Result<{ id: string }, AdminGuardError>> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()
  if (error) throw new Error(`権限確認に失敗しました: ${error.message}`)
  if (profile?.role !== 'admin' || profile.status !== 'active') {
    return { ok: false, error: 'FORBIDDEN' }
  }

  return { ok: true, data: { id: user.id } }
}

export type NgWordListItem = {
  id: string
  word: string
  severity: 'warn' | 'block'
  category: string | null
  createdAt: string
}

export async function listNgWords(): Promise<Result<NgWordListItem[], AdminGuardError>> {
  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { data, error } = await supabase
    .from('ng_words')
    .select('id, word, severity, category, created_at')
    .order('word', { ascending: true })
  if (error) throw new Error(`NGワード一覧の取得に失敗しました: ${error.message}`)

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id,
      word: row.word,
      severity: row.severity as NgWordListItem['severity'],
      category: row.category,
      createdAt: row.created_at,
    })),
  }
}

type AddNgWordError = AdminGuardError | 'INVALID_INPUT' | 'CONFLICT' | 'INTERNAL_ERROR'

export async function addNgWord(
  input: unknown,
): Promise<Result<{ ngWordId: string }, AddNgWordError>> {
  const parsed = addNgWordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  return insertNgWord(supabase, guard.data.id, parsed.data)
}

async function insertNgWord(
  supabase: Client,
  adminId: string,
  input: AddNgWordInput,
): Promise<Result<{ ngWordId: string }, AddNgWordError>> {
  const { data, error } = await supabase
    .from('ng_words')
    .insert({
      word: input.word,
      severity: input.severity,
      category: input.category ?? null,
      created_by: adminId,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION) return { ok: false, error: 'CONFLICT' }
    reportError('admin-ng-words', 'NGワードの追加に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
  if (!data) return { ok: false, error: 'FORBIDDEN' }

  return { ok: true, data: { ngWordId: data.id } }
}

type DeleteNgWordError = AdminGuardError | 'INVALID_INPUT' | 'INTERNAL_ERROR'

export async function deleteNgWord(input: unknown): Promise<Result<null, DeleteNgWordError>> {
  const parsed = deleteNgWordSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  const supabase = await createClient()
  const guard = await requireAdmin(supabase)
  if (!guard.ok) return guard

  const { error } = await supabase.from('ng_words').delete().eq('id', parsed.data.ngWordId)
  if (error) {
    reportError('admin-ng-words', 'NGワードの削除に失敗', error)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }

  return { ok: true, data: null }
}
