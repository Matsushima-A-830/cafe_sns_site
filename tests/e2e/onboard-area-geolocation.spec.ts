import { expect, test } from '@playwright/test'
import { cleanup, createInProgressOnboardingUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_ONBOARD_AREA の「現在地から検索」。実ブラウザでしか気づけない観点に絞る:
 *  - Geolocation の許可→取得→findNearestArea→選択状態への反映が実際に配線されているか
 *   docs/design/wireframes/auth.md #S_ONBOARD_AREA
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

test('位置情報を使うと、最寄りのエリアが自動で選択される', async ({ page, context }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createInProgressOnboardingUser(suffix)
  createdUserIds.push(user.userId)

  await context.grantPermissions(['geolocation'])
  // 渋谷駅。areas.center_location（渋谷区）に最も近い
  await context.setGeolocation({ latitude: 35.658, longitude: 139.7016 })

  await login(page, user, '/onboarding/area')

  // 渋谷区は「よく選ばれるエリア」の初期6件（priority同値のため並び順は不定）に
  // 含まれるとは限らないため、確定した状態はチップの押下状態ではなく確認テキストで見る
  await page.getByRole('button', { name: '位置情報を使う' }).click()
  await expect(page.getByText('選択済み: 渋谷区')).toBeVisible()

  await page.getByRole('button', { name: '次へ' }).click()
  await expect(page).toHaveURL(/\/onboarding\/interests/)
})
