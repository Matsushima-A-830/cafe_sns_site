import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  awardRegularDirect,
  cleanup,
  createActiveCafe,
  createOnboardedUser,
  createPublishedPost,
  uniqueSuffix,
} from './helpers/data'
import { login } from './helpers/login'

/**
 * S_USER_PROFILE_PUBLIC の FollowButton⇄PostFeed協調（pending-items D34）。
 *
 * FollowButton は自分の見た目しか楽観更新しない。実際に visibility='followers' の投稿が
 * 見えるようになるのは、サーバー側で following を再計算した page.tsx が PostFeed を
 * key={`${profile.id}:${following}`} で再マウントするから。この一連
 * （クリック→Server Action→router.refresh()→RSC往復→following再計算→PostFeed再マウント）
 * が実ブラウザで本当に繋がっているかを見る。aria-busy は Server Action の完了しか示さず
 * router.refresh() はその後の useEffect で非同期に呼ばれるため待ち手段にしない
 * （lib/utils/use-deferred-refresh.ts）。代わりに投稿の表示/非表示そのものを
 * Playwright の自動リトライで待つ
 *   app/(browsing)/users/[username]/page.tsx
 *   components/features/profiles/follow-button.tsx
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

function followButton(page: Page): Locator {
  return page.getByRole('button', { name: /^フォロー(中)?$/ })
}

test('フォロー前は限定公開投稿が見えず、フォローすると見え、解除すると再び見えなくなる', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const author = await createOnboardedUser(`author-${suffix}`)
  const viewer = await createOnboardedUser(`viewer-${suffix}`)
  createdUserIds.push(author.userId, viewer.userId)

  const followersPost = await createPublishedPost(author.userId, `followers-${suffix}`, {
    visibility: 'followers',
  })

  await login(page, viewer, `/users/${author.username}`)

  // フォロー前: posts_select RLS がフォロー関係の無い閲覧者にはこの行を返さない
  await expect(page.getByText(followersPost.excerpt)).not.toBeVisible()

  const follow = followButton(page)
  await expect(follow).toHaveText('フォロー')
  await follow.click()
  await expect(follow).toHaveText('フォロー中')

  // 見た目の楽観更新だけでなく、実際に投稿が見えるようになるまでをリトライで待つ
  // （5段リレーが本当に繋がっているかの本題）
  await expect(page.getByText(followersPost.excerpt)).toBeVisible()

  await follow.click()
  await expect(follow).toHaveText('フォロー')
  await expect(page.getByText(followersPost.excerpt)).not.toBeVisible()
})

test('未ログインではフォローできず、ログインへの導線が出る', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const author = await createOnboardedUser(`author-${suffix}`)
  createdUserIds.push(author.userId)

  await page.goto(`/users/${author.username}`)

  await expect(followButton(page)).toHaveCount(0)
  const loginLink = page.getByRole('link', { name: 'ログインしてフォロー' })
  await expect(loginLink).toHaveAttribute(
    'href',
    `/login?next=${encodeURIComponent(`/users/${author.username}`)}`,
  )
})

test('自分のプロフィールではフォローボタンがマイページへの導線に替わる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const self = await createOnboardedUser(`self-${suffix}`)
  createdUserIds.push(self.userId)

  await login(page, self, `/users/${self.username}`)

  await expect(followButton(page)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'マイページへ' })).toHaveAttribute('href', '/me')
})

test('行きつけの認定があるとタブが出て、行きつけカフェが見える', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const author = await createOnboardedUser(`author-${suffix}`)
  const viewer = await createOnboardedUser(`viewer-${suffix}`)
  createdUserIds.push(author.userId, viewer.userId)
  const cafe = await createActiveCafe(suffix)
  createdCafeIds.push(cafe.id)

  // awardedBy は任意の profile id でよい（FK制約のみ）。viewer自身を使い回す
  await awardRegularDirect(author.userId, cafe.id, viewer.userId)

  await login(page, viewer, `/users/${author.username}`)

  const tabs = page.getByRole('tablist', { name: '投稿・行きつけの切り替え' })
  await expect(tabs).toBeVisible()

  await page.getByRole('tab', { name: '行きつけ' }).click()
  await expect(page.getByRole('link', { name: new RegExp(cafe.name) })).toBeVisible()
})

test('行きつけの認定が無いとタブ自体が出ない', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const author = await createOnboardedUser(`author-${suffix}`)
  createdUserIds.push(author.userId)

  await page.goto(`/users/${author.username}`)

  await expect(page.getByRole('tablist', { name: '投稿・行きつけの切り替え' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '投稿' })).toBeVisible()
})
