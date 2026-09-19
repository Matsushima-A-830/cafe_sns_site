import { expect, type Page } from '@playwright/test'
import type { E2EUser } from './data'

/**
 * S_LOGIN からログインする。セッション Cookie をテスト側で組み立てないのは、
 * middleware が JWT のカスタムクレイム（role / status / onboarded）を読んで
 * ルーティングを決めるため — 実際のログインを通さないとクレイムが載らない
 *   supabase/migrations/20260905130500_custom_access_token_hook.sql
 */
export async function login(page: Page, user: E2EUser, next?: string): Promise<void> {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  await page.getByLabel('メールアドレス').fill(user.email)
  await page.getByLabel('パスワード').fill(user.password)
  await page.getByRole('button', { name: 'ログイン' }).click()

  // 遷移を待たずに次の操作へ進むと、ログイン前のページで要素を探しに行く
  await expect(page).toHaveURL(next ?? '/')
}
