import 'server-only'
import { z } from 'zod'
import { optionalString, publicEnvSchema } from './env'

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

// 'server-only' により、クライアントバンドルに混入しようとした時点でビルドエラーになる
export const serverEnv = serverEnvSchema.parse(process.env)
