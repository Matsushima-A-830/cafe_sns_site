import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import {
  addInterestTag,
  cleanup,
  createOnboardedUser,
  createPublishedPost,
  createTestTag,
  tagPost,
  uniqueSuffix,
} from './helpers/data'
import { login } from './helpers/login'

/**
 * S_EXPLORE「おすすめ」⇄「新着」タブ（pending-items D34）。実ブラウザでしか気づけない観点に絞る:
 *  - タブの見た目（aria-current・URL）だけでなく取得元自体が切り替わっているか
 *    （`recommended_post_ranks` は post_tags を inner join するため、興味タグ不一致の投稿は
 *    「おすすめ」に原理的に出てこない。「新着」は getPostList で絞り込み無しの published_at desc）
 *  - 「近くのカフェ」タブは explore-nearby.spec.ts で確認済みなのでここでは扱わない
 *
 * タグをテスト専用の使い捨てにして「おすすめ」側の一致を自分のデータだけに閉じる。
 * 「新着」は絞る術が無く全投稿が対象になるため、厳密な件数・先頭位置ではなく
 * 自分が作った2件の相対順序だけを見る
 *   docs/design/wireframes/browsing.md #S_EXPLORE
 */

const createdUserIds: string[] = []
const createdPostIds: string[] = []
const createdTagIds: string[] = []

test.afterAll(async () => {
  const service = serviceRoleClient()
  if (createdPostIds.length > 0) await service.from('posts').delete().in('id', createdPostIds)
  if (createdTagIds.length > 0) await service.from('tags').delete().in('id', createdTagIds)
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
  createdPostIds.length = 0
  createdTagIds.length = 0
})

test('おすすめタブは興味タグ一致のみ、新着タブは投稿日時順で両方出る', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const viewer = await createOnboardedUser(`viewer-${suffix}`)
  const author = await createOnboardedUser(`author-${suffix}`)
  createdUserIds.push(viewer.userId, author.userId)

  const tag = await createTestTag(suffix)
  createdTagIds.push(tag.id)
  await addInterestTag(viewer.userId, tag.id)

  // 「新着」は画面を絞る術が無く全投稿が対象になるため、並行実行中の他テストの
  // 投稿（概ね「今」の時刻）に埋もれて1ページ目（12件）からあふれないよう、
  // 誰も使わないであろう10年先の未来日時にして必ず先頭付近に来るようにする
  const base = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000
  // 古いが興味タグに一致
  const matched = await createPublishedPost(author.userId, `matched-${suffix}`, {
    publishedAt: new Date(base).toISOString(),
  })
  // 新しいがタグ不一致
  const freshUntagged = await createPublishedPost(author.userId, `fresh-untagged-${suffix}`, {
    publishedAt: new Date(base + 60_000).toISOString(),
  })
  createdPostIds.push(matched.id, freshUntagged.id)
  await tagPost(matched.id, tag.id)

  // おすすめ（recommended_post_ranks）は post_tags を inner join するため、
  // タグ不一致の投稿は新しくても原理的に出てこない。タグが自分専用なので一致するのは
  // このテストが作った投稿だけ — 存在/非存在の確認は並行実行の影響を受けない
  await login(page, viewer, '/explore')
  await expect(page.getByRole('link', { name: 'おすすめ' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(matched.excerpt)).toBeVisible()
  await expect(page.getByText(freshUntagged.excerpt)).not.toBeVisible()

  // 新着タブへの切替（実際にタブをクリックする）。タグ一致に関係なく両方出る。
  // 全投稿が対象になる画面なので、絶対位置ではなく自分の2件の相対順序（新しい方が先）だけを見る
  await page.getByRole('link', { name: '新着' }).click()
  await expect(page).toHaveURL('/explore?tab=new')
  await expect(page.getByRole('link', { name: '新着' })).toHaveAttribute('aria-current', 'page')

  const texts = await page.locator('ul.grid > li').allTextContents()
  const matchedIdx = texts.findIndex((t) => t.includes(matched.excerpt))
  const freshIdx = texts.findIndex((t) => t.includes(freshUntagged.excerpt))
  expect(matchedIdx).toBeGreaterThanOrEqual(0)
  expect(freshIdx).toBeGreaterThanOrEqual(0)
  expect(freshIdx).toBeLessThan(matchedIdx)
})
