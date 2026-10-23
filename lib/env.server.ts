import 'server-only'
import { z } from 'zod'
import { optionalString, publicEnvSchema } from './env'

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // GitHub Actions の schedule から cron 系 Route Handler を叩く際の共有シークレット
  //   docs/operations/deployment.md #定期実行ジョブ
  CRON_SECRET: z.string().min(1),
  AWS_S3_BUCKET: optionalString(),
  AWS_S3_REGION: optionalString(),
  AWS_ACCESS_KEY_ID: optionalString(),
  AWS_SECRET_ACCESS_KEY: optionalString(),
  RESEND_API_KEY: optionalString(),
  // 独自ドメイン未認証の間は onboarding@resend.dev 固定（Resend側の制約）。
  // 認証後は .env で実ドメインのアドレスに差し替える運用にする
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  SENTRY_DSN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
})

// 'server-only' により、クライアントバンドルに混入しようとした時点でビルドエラーになる
export const serverEnv = serverEnvSchema.parse(process.env)
