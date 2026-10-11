import { expect, test } from '@playwright/test'
import {
  addToCafeList,
  cleanup,
  createActiveCafe,
  createOnboardedUser,
  uniqueSuffix,
} from './helpers/data'
import { login } from './helpers/login'

/**
 * S_FAVORITES / S_WANT_TO_GO の一覧ページそのもの。
 *
 * cafe-list-toggle.spec.ts は S_CAFE_DETAIL のトグルボタンと S_MYPAGE の件数バッジしか
 * 開いておらず、一覧ページ（CafeListView）はこれまで一度も実ブラウザで開かれていない。
 * この一覧の「外す」は cafe-list-buttons.tsx のトグルとは別パターンで
 * `router.refresh()` を呼ばない単純な楽観更新なので、ここでは「リロード後も
 * DBに反映されているか」で確かめる（aria-busy のリレーを待つのではない）
 *   components/features/cafes/cafe-list-view.tsx
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

test('お気に入りに追加済みのカフェが一覧に表示され、「外す」でリロード後も消える', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)
  const cafe = await createActiveCafe(suffix)
  createdCafeIds.push(cafe.id)
  await addToCafeList(user.userId, cafe.id, 'favorite')

  await login(page, user, '/me/favorites')

  await expect(page.getByRole('link', { name: cafe.name })).toBeVisible()

  const removeButton = page.getByRole('button', { name: `${cafe.name}をお気に入りから外す` })
  await removeButton.click()
  await expect(
    page.getByText('お気に入りのカフェはまだありません。カフェのページから追加できます。'),
  ).toBeVisible()

  // 楽観更新ですぐにボタン自体が消えるため、完了は aria-busy ではなく
  // 完了後に出る live region のメッセージで待つ（cafe-list-view.tsx）
  await expect(page.getByText(`${cafe.name}をお気に入りから外しました`)).toBeVisible()

  // router.refresh() を呼ばない設計なので、リロードしてサーバー描画の値だけが
  // 残っていることを確かめる
  await page.reload()
  await expect(page.getByRole('link', { name: cafe.name })).not.toBeVisible()
})

test('お気に入りを一覧から外しても、同じカフェの「行きたい」は残る', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-x`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)
  const cafe = await createActiveCafe(suffix)
  createdCafeIds.push(cafe.id)
  await addToCafeList(user.userId, cafe.id, 'favorite')
  await addToCafeList(user.userId, cafe.id, 'want_to_go')

  await login(page, user, '/me/favorites')

  const removeButton = page.getByRole('button', { name: `${cafe.name}をお気に入りから外す` })
  await removeButton.click()
  await expect(page.getByText(`${cafe.name}をお気に入りから外しました`)).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: cafe.name })).not.toBeVisible()

  await page.goto('/me/want-to-go')
  await expect(page.getByRole('link', { name: cafe.name })).toBeVisible()
})

test('メモを付けて行きたいに追加したカフェは一覧にメモが表示される', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-note`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)
  const cafe = await createActiveCafe(suffix)
  createdCafeIds.push(cafe.id)
  await addToCafeList(user.userId, cafe.id, 'want_to_go', '誕生日に行きたい')

  await login(page, user, '/me/want-to-go')

  await expect(page.getByRole('link', { name: cafe.name })).toBeVisible()
  await expect(page.getByText('誕生日に行きたい')).toBeVisible()
})
