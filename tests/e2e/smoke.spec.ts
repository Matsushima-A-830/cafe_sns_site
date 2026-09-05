import { expect, test } from '@playwright/test'

// E2Eパイプラインが実際に動いていることを保証する最小テスト。
// これが無いと --pass-with-no-tests でグリーンになり、CI の故障に気づけない。
test('ホームが描画される', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page).toHaveTitle(/カフェSNS/)
})
