import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type LocalCredentials = {
  url: string
  anonKey: string
  serviceRoleKey: string
}

let cached: LocalCredentials | undefined

/** `supabase status -o env` の `KEY="value"` 形式をパースする */
function parseCliEnv(raw: string): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const matched = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim())
    if (matched?.[1] && matched[2] !== undefined) entries[matched[1]] = matched[2]
  }
  return entries
}

// 0.0.0.0 は bind 用アドレスで接続先としては意味を持たず、環境によっては
// ローカル以外に解決されうるので許可しない
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

// このファイルの利用者は service role で areas/tags/badges を delete し、
// auth のユーザーを作っては消す。接続先がローカルであることを必ず確かめてから返す。
// 運用スクリプト用に SUPABASE_URL を export したまま pnpm test:integration を叩くと、
// ガードが無ければそのプロジェクトの行が消える。
export function assertLocal(url: string): void {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch (cause) {
    throw new Error(`Supabase の URL として解釈できない: ${url}`, { cause })
  }
  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      `統合テストはローカル Supabase 専用。ローカル以外への接続を拒否した: ${hostname}。` +
        'service role で実データを削除するため、リモートに向けては実行できない。',
    )
  }
}

// ローカルの鍵は supabase start のたびに変わりうるので、環境変数が無ければ CLI に聞く。
// CI では env を渡さずこの経路に乗せてよい（supabase は devDependency なので pnpm exec で届く）。
function loadCredentials(): LocalCredentials {
  if (cached) return cached

  const fromEnv = {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
  if (fromEnv.url && fromEnv.anonKey && fromEnv.serviceRoleKey) {
    assertLocal(fromEnv.url)
    cached = fromEnv as LocalCredentials
    return cached
  }

  let cliEnv: Record<string, string>
  try {
    cliEnv = parseCliEnv(
      execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
  } catch (cause) {
    // 原因を握り潰さない。Windows から直接叩くと pnpm.cmd が見つからず ENOENT になるが、
    // 「起動していない」と読めるメッセージだけだと原因を見失う
    const detail = cause instanceof Error ? cause.message : String(cause)
    throw new Error(
      `ローカル Supabase の接続情報を取得できない。\`pnpm db:start\` で起動してから実行する。原因: ${detail}`,
      { cause },
    )
  }

  const url = cliEnv.API_URL
  const anonKey = cliEnv.ANON_KEY
  const serviceRoleKey = cliEnv.SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error('supabase status の出力に API_URL / ANON_KEY / SERVICE_ROLE_KEY が無い。')
  }

  assertLocal(url)
  cached = { url, anonKey, serviceRoleKey }
  return cached
}

const NO_PERSIST = { auth: { persistSession: false, autoRefreshToken: false } } as const

/** 未ログイン（Postgres の `anon` ロール）で叩くクライアント */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = loadCredentials()
  return createClient(url, anonKey, NO_PERSIST)
}

/** RLS をバイパスする管理用クライアント。前提データの用意と後片付けにのみ使う */
export function serviceRoleClient(): SupabaseClient {
  const { url, serviceRoleKey } = loadCredentials()
  return createClient(url, serviceRoleKey, NO_PERSIST)
}

export type AuthedUser = {
  /** ログイン済み（Postgres の `authenticated` ロール）で叩くクライアント */
  client: SupabaseClient
  userId: string
  cleanup: () => Promise<void>
}

/**
 * 使い捨ての認証済みユーザーを作る。
 * profiles はまだ存在しないため auth.users だけを作る（RLS のロール判定にはこれで足りる）。
 */
export async function createAuthedUser(): Promise<AuthedUser> {
  const { url, anonKey } = loadCredentials()
  const service = serviceRoleClient()
  const email = `rls-test-${crypto.randomUUID()}@example.test`
  const password = crypto.randomUUID()

  const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) {
    throw new Error(`テストユーザーの作成に失敗: ${created.error?.message}`)
  }
  const userId = created.data.user.id

  const client = createClient(url, anonKey, NO_PERSIST)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) {
    await service.auth.admin.deleteUser(userId)
    throw new Error(`テストユーザーのログインに失敗: ${signedIn.error.message}`)
  }

  return {
    client,
    userId,
    cleanup: async () => {
      await service.auth.admin.deleteUser(userId)
    },
  }
}
