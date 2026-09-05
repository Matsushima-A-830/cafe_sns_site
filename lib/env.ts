import { z } from 'zod'

// .env.example の「[任意] は空のままでよい」に合わせ、空文字は未設定(undefined)として扱う。
// z.string().min(1).optional() は空文字を弾いてしまうため、optional な値はこれを経由させる
const optionalString = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional())

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optionalString(),
})

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  AWS_S3_BUCKET: optionalString(),
  AWS_S3_REGION: optionalString(),
  AWS_ACCESS_KEY_ID: optionalString(),
  AWS_SECRET_ACCESS_KEY: optionalString(),
  RESEND_API_KEY: optionalString(),
  SENTRY_DSN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
})

// server-only な値（SUPABASE_SERVICE_ROLE_KEY 等）はクライアントバンドルには含まれないが、
// 型としては常に ServerEnv を返す。参照側は server-only なモジュールでのみ server 用の値を使う規約
export const env = (
  typeof window === 'undefined'
    ? serverEnvSchema.parse(process.env)
    : publicEnvSchema.parse({
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      })
) as z.infer<typeof serverEnvSchema>
