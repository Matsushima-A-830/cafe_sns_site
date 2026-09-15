import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// lib/env は import 時に Zod で検証するため、未設定だと env を辿る全テストが落ちる。
// ユニットテストは実サーバに繋がないので、形式だけ満たすローカル既定値を入れる
// （.env.local は vitest からは読み込まれない）
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000'

afterEach(() => {
  cleanup()
})
