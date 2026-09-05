import { expect, test } from '@playwright/test'
import { fetchLatestOtp } from '../helpers/mailpit'

// サインアップ〜オンボーディング完走までの縦切り。
// 実際のローカル Supabase (メール送信含む) を使う。CI は integration.yml と同様に
// `supabase start` 済みの環境を前提とする（.github/workflows/e2e.yml）
test('成人がサインアップからオンボーディングを完走してホームに到達する', async ({ page }) => {
  const unique = `${Date.now()}-${test.info().project.name}`
  const email = `e2e-${unique}@example.com`
  const username = `e2e_${unique}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)

  // --- S_SIGNUP (1/3): アカウント情報 ---
  await page.goto('/signup')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード（8文字以上、英数字混合）').fill('password1')
  await page.getByLabel('パスワード（確認）').fill('password1')
  await page.getByLabel('利用規約 と プライバシー に同意').click()
  await page.getByRole('button', { name: '次へ' }).click()

  // --- S_SIGNUP (2/3): OTP ---
  await expect(page).toHaveURL(/\/signup\/verify/)
  const otp = await fetchLatestOtp(email)
  await page.getByLabel('確認コード').fill(otp)
  await page.getByRole('button', { name: '認証' }).click()

  // --- S_SIGNUP (3/3): 生年月日（成人） ---
  await expect(page).toHaveURL(/\/signup\/birthdate/)
  await page.getByLabel('年').selectOption('2000')
  await page.getByLabel('月').selectOption('1')
  await page.getByLabel('日').selectOption('1')
  await page.getByRole('button', { name: '次へ' }).click()

  // --- S_ONBOARD_PROFILE ---
  await expect(page).toHaveURL(/\/onboarding\/profile/)
  await page.getByLabel('ユーザーネーム（英数字_）').fill(username)
  await page.getByLabel('表示名').fill('E2Eテスト太郎')
  await page.getByRole('button', { name: '次へ' }).click()

  // --- S_ONBOARD_AREA（一覧から選択。現在地検索は A3 未実装のため対象外） ---
  await expect(page).toHaveURL(/\/onboarding\/area/)
  await page.getByRole('button', { name: '千代田区' }).click()
  await page.getByRole('button', { name: '次へ' }).click()

  // --- S_ONBOARD_INTERESTS（幹A: スキップ不可） ---
  await expect(page).toHaveURL(/\/onboarding\/interests/)
  await page.getByRole('button', { name: 'ひとり時間' }).click()
  await page.getByRole('button', { name: 'はじめる！' }).click()

  // --- S_MY_HOME に到達し、ログイン状態になっている ---
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible()
})

test('13歳未満は登録できない', async ({ page }) => {
  const unique = `${Date.now()}-${test.info().project.name}-u13`
  const email = `e2e-${unique}@example.com`

  await page.goto('/signup')
  await page.getByLabel('メールアドレス').fill(email)
  await page.getByLabel('パスワード（8文字以上、英数字混合）').fill('password1')
  await page.getByLabel('パスワード（確認）').fill('password1')
  await page.getByLabel('利用規約 と プライバシー に同意').click()
  await page.getByRole('button', { name: '次へ' }).click()

  await expect(page).toHaveURL(/\/signup\/verify/)
  const otp = await fetchLatestOtp(email)
  await page.getByLabel('確認コード').fill(otp)
  await page.getByRole('button', { name: '認証' }).click()

  await expect(page).toHaveURL(/\/signup\/birthdate/)
  const twelveYearsAgo = new Date().getFullYear() - 12
  await page.getByLabel('年').selectOption(String(twelveYearsAgo))
  await page.getByLabel('月').selectOption('1')
  await page.getByLabel('日').selectOption('1')
  await page.getByRole('button', { name: '次へ' }).click()

  await expect(page).toHaveURL(/\/signup\/blocked/)
  await expect(page.getByRole('heading', { name: '登録できません' })).toBeVisible()
})
