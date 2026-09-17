import { loadCredentials } from './helpers/supabase'

/**
 * 実装側が lib/env（NEXT_PUBLIC_*）を import 時に Zod で検証するため、統合テストでも
 * 値を入れておく（.env.local は vitest から読まれない）。
 *
 * ダミーではなくローカル Supabase の実値を入れるのは、isStoragePublicUrl が
 * NEXT_PUBLIC_SUPABASE_URL と突き合わせて画像URLを判定するため（ずれると常に false になる）
 */
const { url, anonKey } = loadCredentials()

process.env.NEXT_PUBLIC_SUPABASE_URL ??= url
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= anonKey
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000'
