import { z } from 'zod'

// .env.example の「[任意] は空のままでよい」に合わせ、空文字は未設定(undefined)として扱う。
// z.string().min(1).optional() は空文字を弾いてしまうため、optional な値はこれを経由させる
export const optionalString = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional())

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optionalString(),
})

// クライアントバンドルに含まれてよい値のみ。SUPABASE_SERVICE_ROLE_KEY 等は lib/env.server.ts
// （'server-only' 付き）に分離し、誤ってブラウザ向けコードから型エラー無く参照できないようにする
export const env = publicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
})
