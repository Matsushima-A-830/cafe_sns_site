import { expect, test } from '@playwright/test'
import { cleanup, createPendingConsentUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

// 保護者同意フロー（B3）。実際のメール送信はローカル/CIでRESEND_API_KEY未設定のため
// 検証できない（Resendは外部HTTP APIでMailpitに捕捉できない）。ここでは「保護者がメールの
// リンクをクリックする」動作を、service roleで発行した生トークンへの実リクエストで代替する
//   docs/product/pending-items.md B3
test('保護者が同意リンクを踏むとstatusがactiveになり、本人は「状態を確認する」で反映できる', async ({
  page,
  baseURL,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createPendingConsentUser(suffix)

  try {
    await login(page, user)

    // S_MY_HOME: 同意待ちバナーが出ている
    await expect(page.getByText('保護者の同意待ちです')).toBeVisible()

    await page.goto('/account/pending')
    await expect(page.getByRole('button', { name: '状態を確認する' })).toBeVisible()
    await expect(page.getByRole('button', { name: '再送する' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'メールアドレスを変更' })).toBeVisible()

    // --- 保護者が本人のログイン中ブラウザ（家族共有端末等）でリンクを踏むケースも通ること ---
    // page.request は page と同じブラウザコンテキストなのでログイン中のCookieを引き継ぐ。
    // 通常のcreateClient()（cookieを見る）を使うと guard_privileged_profile_columns トリガーが
    // 「本人が自分でstatusを変えようとした」と誤認しFORBIDDENになる不具合をコードレビューで発見。
    // /api/consent/confirm は createAnonClient()（cookieを一切見ない）を使うことで回避している
    const confirmRes = await page.request.get(
      `${baseURL}/api/consent/confirm?token=${encodeURIComponent(user.consentToken)}`,
      { maxRedirects: 0 },
    )
    expect(confirmRes.status()).toBe(307)
    expect(confirmRes.headers().location).toContain('/account/pending?consent=success')

    // --- 本人のブラウザには古いJWTが残っているため、明示的な確認操作が要る ---
    await page.reload()
    await page.getByRole('button', { name: '状態を確認する' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByText('保護者の同意待ちです')).toBeHidden()
  } finally {
    await cleanup({ userIds: [user.userId] })
  }
})

test('無効なトークンでの同意リンクアクセスは invalid にリダイレクトされる', async ({
  request,
  baseURL,
}) => {
  const res = await request.get(`${baseURL}/api/consent/confirm?token=no-such-token`, {
    maxRedirects: 0,
  })
  expect(res.status()).toBe(307)
  expect(res.headers().location).toContain('/account/pending?consent=invalid')
})
