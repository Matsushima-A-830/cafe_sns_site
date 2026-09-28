import { expect, test } from '@playwright/test'
import { cleanup, createActiveCafe, uniqueSuffix } from './helpers/data'

/**
 * S_CAFE_DETAIL の地図（pending-items D30）。実ブラウザでしか気づけない観点に絞る:
 *  - モバイル幅では地図が既定で隠れており、「地図で見る」で開閉できる（CSSのlg:hiddenの回帰防止）
 *  - 座標未収集のカフェ（バックフィル未実施分）では地図セクション自体が出ない
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL
 */

const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ cafeIds: createdCafeIds })
  createdCafeIds.length = 0
})

test('モバイル幅では地図が既定で隠れており、「地図で見る」で開閉できる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const cafe = await createActiveCafe(suffix, { location: 'SRID=4326;POINT(139.702 35.659)' })
  createdCafeIds.push(cafe.id)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/cafes/${cafe.id}`)

  const toggle = page.getByRole('button', { name: /^地図で見る$/ })
  const mapHeading = page.getByRole('heading', { name: '地図' })
  await expect(mapHeading).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await expect(page.getByRole('button', { name: /^地図を閉じる$/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
})

test('座標未収集のカフェでは地図セクションが出ない', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const cafe = await createActiveCafe(suffix)
  createdCafeIds.push(cafe.id)

  await page.goto(`/cafes/${cafe.id}`)

  await expect(page.getByRole('heading', { name: '地図' })).not.toBeVisible()
})
