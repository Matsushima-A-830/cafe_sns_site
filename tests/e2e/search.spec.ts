import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, createPublishedPost, uniqueSuffix } from './helpers/data'

/**
 * S_SEARCH の雰囲気(mood) × 利用機会(occasion) の絞り込みと、
 * 「よく使うタグ」チップ→フォームの値の同期を実機で確認する。
 *
 * 両方とも「壊れても見た目は動いているように見える」種類の不具合
 * （タグのAND/OR取り違え、Link遷移でのdefaultValue不同期）で、
 * ユニット/統合テストの層だけでは気づけない
 *   docs/design/wireframes/browsing.md #S_SEARCH
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

test('雰囲気と利用機会を両方指定すると、両方のタグを持つ投稿だけに絞り込まれる', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  const service = serviceRoleClient()
  const { data: moodTag } = await service.from('tags').select('id').eq('slug', 'quiet').single()
  const { data: occasionTag } = await service.from('tags').select('id').eq('slug', 'work').single()

  const both = await createPublishedPost(user.userId, `${suffix}-both`)
  const moodOnly = await createPublishedPost(user.userId, `${suffix}-mood-only`)

  await service.from('post_tags').insert([
    { post_id: both.id, tag_id: moodTag?.id },
    { post_id: both.id, tag_id: occasionTag?.id },
    { post_id: moodOnly.id, tag_id: moodTag?.id },
  ])

  await page.goto('/search')
  await page.getByLabel('雰囲気').selectOption('quiet')
  await page.getByLabel('利用機会').selectOption('work')
  await page.getByRole('button', { name: '検索する' }).click()

  await expect(page.getByText(both.excerpt)).toBeVisible()
  await expect(page.getByText(moodOnly.excerpt)).not.toBeVisible()
})

test('「よく使うタグ」チップを押すと、対応するドロップダウンの選択状態も更新される', async ({
  page,
}) => {
  await page.goto('/search')

  const occasionSelect = page.getByLabel('利用機会')
  await expect(occasionSelect).toHaveValue('')

  // 「もしかして」の関連タグ提案にも同じラベルが出うるため、フォーム内のチップに絞る
  // クリック先で select の defaultValue が更新されない回帰（key 無しの Link 遷移）を防ぐ
  await page.locator('form').getByRole('link', { name: '#デート' }).click()
  await expect(page).toHaveURL(/occasion=date/)
  await expect(occasionSelect).toHaveValue('date')
})

test('「よく使うタグ」の「もっと見る」を押すと表示件数が増える', async ({ page }) => {
  await page.goto('/search')

  const chips = page.locator('form').getByRole('list').first().getByRole('listitem')
  const initialCount = await chips.count()
  expect(initialCount).toBe(7) // FREQUENT_TAG_LIMIT（選択のパラドックス回避）

  // クリック先が tagsExpanded=1 を運ばない回帰（searchHref が持たないクエリを握りつぶす）を防ぐ
  await page.locator('form').getByRole('link', { name: 'もっと見る' }).click()
  await expect(page).toHaveURL(/tagsExpanded=1/)
  await expect(chips).not.toHaveCount(initialCount)
})
