import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import {
  addInterestTag,
  cleanup,
  createActiveCafe,
  createOnboardedUser,
  createPublishedPost,
  createTestTag,
  followUser,
  tagPost,
  uniqueSuffix,
} from './helpers/data'
import { login } from './helpers/login'

/**
 * S_HOME（pending-items D34）。実ブラウザでしか気づけない観点に絞る:
 *  - ムードチップ（MoodEntry）が実際に /explore?tag=... への絞り込みに繋がっているか
 *  - 発見⇄フォロー中タブが「見た目はタブが切り替わる」だけでなく中身まで変わるか
 *    （未ログイン時はフォロー中タブ自体を出さない — user && <FeedTabs> の分岐）
 *  - おすすめタブの「もっと見る」ページング（recommended_post_ranks のkeysetカーソル）が
 *    実ブラウザのスクロールで重複・欠落しないか（D34 落とし穴3）
 *   docs/design/wireframes/browsing.md #S_HOME
 */

const createdCafeIds: string[] = []
const createdUserIds: string[] = []
const createdPostIds: string[] = []
const createdTagIds: string[] = []

test.afterAll(async () => {
  const service = serviceRoleClient()
  if (createdPostIds.length > 0) await service.from('posts').delete().in('id', createdPostIds)
  if (createdTagIds.length > 0) await service.from('tags').delete().in('id', createdTagIds)
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdCafeIds.length = 0
  createdUserIds.length = 0
  createdPostIds.length = 0
  createdTagIds.length = 0
})

test('ムードチップをクリックすると該当タグの投稿に絞り込まれる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const author = await createOnboardedUser(suffix)
  createdUserIds.push(author.userId)

  const tagged = await createPublishedPost(author.userId, `tagged-${suffix}`)
  const untagged = await createPublishedPost(author.userId, `untagged-${suffix}`)
  createdPostIds.push(tagged.id, untagged.id)
  await tagPost(tagged.id, 'solo-time')

  await page.goto('/')
  // 画面上に「ひとり時間」というテキストリンクは SuggestedTags にも出るため、
  // MoodEntry の region（aria-labelledby）に絞って探す
  const moodEntry = page.getByRole('region', { name: '今、どんなカフェ気分？' })
  await moodEntry.getByRole('link', { name: 'ひとり時間', exact: true }).click()

  await expect(page).toHaveURL('/explore?tag=solo-time')
  await expect(page.getByText(tagged.excerpt)).toBeVisible()
  await expect(page.getByText(untagged.excerpt)).not.toBeVisible()
})

test('「今、どんなカフェ気分？」の「もっと見る ▶」は S_SEARCH に遷移する', async ({ page }) => {
  await page.goto('/')
  const moodEntry = page.getByRole('region', { name: '今、どんなカフェ気分？' })
  await moodEntry.getByRole('link', { name: 'もっと見る ▶' }).click()
  await expect(page).toHaveURL('/search')
})

test('フォロー中タブは未ログイン時は出ず、ログイン後はフォロー中の投稿だけに絞られる', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const viewer = await createOnboardedUser(`viewer-${suffix}`)
  const followee = await createOnboardedUser(`followee-${suffix}`)
  const stranger = await createOnboardedUser(`stranger-${suffix}`)
  createdUserIds.push(viewer.userId, followee.userId, stranger.userId)

  // 発見タブ（新着フォールバック）はareaCodeで絞れる唯一のスコープだが、area_codeは
  // 固定の既存エリアしか選べずテストごとに一意にできない（同じコードを使う他テスト・
  // 他ブラウザプロジェクトと共有される）。area絞り込みに加えて、誰も使わないであろう
  // 10年先の未来日時にしておき、万一他の投稿と混ざっても published_at desc の先頭付近に
  // 必ず残るようにする（explore-tabs.spec.ts と同じ手法）
  const area = 'JP-13-harajuku'
  const cafe = await createActiveCafe(suffix, { area_code: area })
  createdCafeIds.push(cafe.id)

  const base = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000
  const followeePost = await createPublishedPost(followee.userId, `followee-${suffix}`, {
    cafeId: cafe.id,
    publishedAt: new Date(base).toISOString(),
  })
  const strangerPost = await createPublishedPost(stranger.userId, `stranger-${suffix}`, {
    cafeId: cafe.id,
    publishedAt: new Date(base + 60_000).toISOString(),
  })
  createdPostIds.push(followeePost.id, strangerPost.id)

  await followUser(viewer.userId, followee.userId)

  // 未ログインはタブ自体が無い（page.tsx の `{user && <FeedTabs ...>}`）
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'フィードの種類' })).toHaveCount(0)

  await login(page, viewer, `/?area=${area}`)
  await expect(page.getByRole('navigation', { name: 'フィードの種類' })).toBeVisible()

  // 発見タブ（興味タグ未設定なので新着にフォールバック） — 両方見える
  await expect(page.getByText(followeePost.excerpt)).toBeVisible()
  await expect(page.getByText(strangerPost.excerpt)).toBeVisible()

  // タブ切替はarea等の絞り込みを引き継がない（home-side-nav/page.tsx のhrefは `/?tab=following` 固定）。
  // フォロー中は followerId 自体で絞られるのでそれでも検証は成立する
  await page.getByRole('link', { name: 'フォロー中' }).click()
  await expect(page).toHaveURL('/?tab=following')
  await expect(page.getByText(followeePost.excerpt)).toBeVisible()
  await expect(page.getByText(strangerPost.excerpt)).not.toBeVisible()
})

test('おすすめタブはスクロールでページングしても重複・欠落しない', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const viewer = await createOnboardedUser(`viewer-${suffix}`)
  const author = await createOnboardedUser(`author-${suffix}`)
  createdUserIds.push(viewer.userId, author.userId)

  // 厳選タグ（例: solo-time）を使うと、並行実行中の他テスト・他ブラウザプロジェクトが
  // 同じタグを付けた投稿まで一致数に乗ってきてページング検証が崩れる。
  // テスト専用の使い捨てタグにすることで、一致するのはこのテストが作った投稿だけにする
  const tag = await createTestTag(suffix)
  createdTagIds.push(tag.id)
  await addInterestTag(viewer.userId, tag.id)

  // 一致タグ数が同数（1）なので published_at desc で並ぶ。新しい順に 12..00 の
  // ラベルを振り、1ページ目（12件）→スクロールで13件目（最も古い post00）が出ることを確認する
  const postCount = 13
  const base = Date.now()
  const posts = await Promise.all(
    Array.from({ length: postCount }, async (_, i) => {
      const label = String(i).padStart(2, '0')
      const publishedAt = new Date(base + i * 60_000).toISOString()
      const post = await createPublishedPost(author.userId, `rank-${label}-${suffix}`, {
        publishedAt,
      })
      await tagPost(post.id, tag.id)
      return post
    }),
  )
  createdPostIds.push(...posts.map((post) => post.id))
  // posts[12] が最新（一番上に出る） / posts[0] が最古（最後、スクロール後に出る）
  const newest = posts[postCount - 1]
  const oldest = posts[0]

  await login(page, viewer)

  const feedItems = page.locator('ul.grid > li')
  await expect(feedItems).toHaveCount(12)
  await expect(page.getByText(newest.excerpt)).toBeVisible()
  await expect(page.getByText(oldest.excerpt)).not.toBeVisible()

  // 「もっと見る」ボタンは sr-only（キーボード操作時のみ可視）で、通常の利用経路は
  // IntersectionObserver によるスクロール自動読み込みのため、実際の使われ方に合わせて
  // 末尾の投稿をスクロールで視界に入れる
  await feedItems.last().scrollIntoViewIfNeeded()

  await expect(feedItems).toHaveCount(13)
  await expect(page.getByText(oldest.excerpt)).toBeVisible()
  // 読み込みきった後は「もっと見る」ボタン自体が消える（cursor === null）
  await expect(page.getByRole('button', { name: /もっと見る|読み込み中/ })).toHaveCount(0)

  // 重複が無いこと（13件ぶん全部ユニークな抜粋テキストが1回ずつ出ている）
  const texts = await Promise.all(posts.map((post) => feedItems.getByText(post.excerpt).count()))
  for (const count of texts) expect(count).toBe(1)
})
