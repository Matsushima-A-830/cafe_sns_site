import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'
import type { Database } from '@/types/database'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/** Client Component 用クライアント。ブラウザ内でシングルトンにする */
export function createClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
  }
  return client
}
