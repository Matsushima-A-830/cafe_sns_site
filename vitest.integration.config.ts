import path from 'node:path'
import { defineConfig } from 'vitest/config'

// 実 Supabase（pnpm db:start）を叩く統合テスト専用。
// ユニット実行 (pnpm test:run) からは vitest.config.ts の exclude で外してある。
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup-integration.ts'],
    include: ['tests/integration/**/*.test.ts'],
    // 単一のローカルDBを共有するため、ファイル間の並列実行はしない
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
