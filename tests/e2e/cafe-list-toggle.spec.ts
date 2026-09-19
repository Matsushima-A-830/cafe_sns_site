import { expect, type Locator, test } from '@playwright/test'
import { cleanup, createActiveCafe, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_CAFE_DETAIL の「お気に入り」「行きたい」トグルと、S_MYPAGE の件数バッジの結び付き。
 *
 * 楽観更新 + `router.refresh()` の組み合わせなので、画面上は成功に見えても DB に
 * 入っていない・リロードで消えるといった壊れ方をする。ユニットとコンポーネントの
 * テストはサーバーをモックするためこの層を通らない
 *   docs/design/wireframes/browsing.md #S_CAFE_DETAIL / mypage.md #S_MYPAGE
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

/**
 * トグルは送信中 `disabled` にせず `handleClick` の `isPending` ガードで連打を止める。
 * `router.refresh()` の完了まで押下は黙って捨てられるので、次の操作前に必ず待つ
 *   components/features/cafes/cafe-list-buttons.tsx
 */
async function waitIdle(button: Locator) {
  await expect(button).toHaveAttribute('aria-busy', 'false')
}

/** 片方の作成が失敗してももう片方を回収できるよう、作った端から登録する（並列化しない） */
async function setup(projectName: string) {
  const suffix = uniqueSuffix(projectName)

  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  const cafe = await createActiveCafe(suffix)
  createdCafeIds.push(cafe.id)

  return { user, cafe }
}

test('お気に入りに追加するとリロード後も残り、マイページの件数に出る', async ({ page }) => {
  const { user, cafe } = await setup(test.info().project.name)

  await login(page, user, `/cafes/${cafe.id}`)

  // 「お気に入り」→「お気に入り済み」でラベル自体が変わるので、どちらにも当たる名前で掴む
  const favorite = page.getByRole('button', { name: /^お気に入り(済み)?$/ })
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')

  await favorite.click()
  // 色だけで状態を伝えていないこと（ラベルと aria-pressed の両方）を確かめる
  await expect(favorite).toHaveAccessibleName('お気に入り済み')
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')

  // 楽観更新が DB に届いているか。リロードするとサーバー描画の値だけが残る
  await page.reload()
  await expect(page.getByRole('button', { name: 'お気に入り済み' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // 件数バッジは数字を読み上げさせないため aria-label に「お気に入り 1件」を持つ
  await page.goto('/me')
  await expect(page.getByRole('link', { name: 'お気に入り 1件' })).toBeVisible()
  await expect(page.getByRole('link', { name: '行きたい 0件' })).toBeVisible()
})

test('お気に入りを外しても同じカフェの「行きたい」は残る', async ({ page }) => {
  const { user, cafe } = await setup(`${test.info().project.name}-x`)

  await login(page, user, `/cafes/${cafe.id}`)

  const favorite = page.getByRole('button', { name: /^お気に入り(済み)?$/ })
  const wantToGo = page.getByRole('button', { name: /^行きたい(済み)?$/ })

  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await waitIdle(favorite)

  await wantToGo.click()
  await expect(wantToGo).toHaveAttribute('aria-pressed', 'true')
  await waitIdle(wantToGo)

  // 2つは排他ではない。片方を外したときに、もう片方の行まで消えないこと
  await favorite.click()
  await expect(favorite).toHaveAttribute('aria-pressed', 'false')
  await expect(wantToGo).toHaveAttribute('aria-pressed', 'true')
  await waitIdle(favorite)

  await page.goto('/me')
  await expect(page.getByRole('link', { name: 'お気に入り 0件' })).toBeVisible()
  await expect(page.getByRole('link', { name: '行きたい 1件' })).toBeVisible()
})
