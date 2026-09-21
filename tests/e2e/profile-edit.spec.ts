import { expect, test } from '@playwright/test'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_PROFILE_EDIT。表示名・bio・ホームエリアは updateProfile / submitArea の2つの
 * Server Action にまたがるため、実ブラウザで一往復させて両方が反映されることを確かめる
 *   app/_actions/profiles.ts app/_actions/onboarding.ts
 *   docs/design/wireframes/mypage.md #S_PROFILE_EDIT
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

test('表示名・自己紹介・ホームエリアを保存するとリロード後も反映される', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await login(page, user, '/me/edit')

  const saveButton = page.getByRole('button', { name: '保存' })
  await expect(saveButton).toBeDisabled()

  await page.getByLabel('表示名').fill('E2E新しい表示名')
  await page.getByLabel('自己紹介').fill('E2Eの自己紹介です')
  // 上位6件（priority 同値の並び順）に依存しないよう検索してから選ぶ
  await page.getByLabel('エリアを検索').fill('渋谷')
  await page.getByRole('button', { name: '渋谷区' }).click()

  await expect(saveButton).toBeEnabled()
  await saveButton.click()

  await expect(page).toHaveURL('/me')
  await expect(page.getByRole('heading', { name: 'E2E新しい表示名' })).toBeVisible()
  await expect(page.getByText('E2Eの自己紹介です')).toBeVisible()

  await page.goto('/me/edit')
  await expect(page.getByLabel('表示名')).toHaveValue('E2E新しい表示名')
  // 渋谷区は featured 6件に入らないため、チップではなく「選択中」表示で確認する
  await expect(page.getByText('選択中: 渋谷区')).toBeVisible()
})

test('ユーザーネームは変更できず、未変更時は保存ボタンが disabled のまま', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-u`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await login(page, user, '/me/edit')

  await expect(page.getByLabel('ユーザーネーム（変更不可）')).toBeDisabled()
  await expect(page.getByLabel('ユーザーネーム（変更不可）')).toHaveValue(`@${user.username}`)
  await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()
})
