import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'

/**
 * S_MAP。実ブラウザでしか気づけない観点に絞る:
 *  - 一覧とフィルタ（エリア）が実際に nearby_cafes 経由で連動しているか
 *    （searchNearbyCafes の配線が壊れても見た目のフォームは動いているように見える）
 *  - 座標の無いカフェが一覧に出ない（location NULL を除外する where 句の回帰防止）
 *  - 雰囲気（mood）タグの絞り込みが実際に nearby_cafes と post_tags 経由で連動しているか（D63）
 *   docs/design/wireframes/browsing.md #S_MAP
 */

const createdCafeIds: string[] = []
const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdCafeIds.length = 0
  createdUserIds.length = 0
})

test('エリアで絞り込むと、対象エリアのカフェだけが一覧に残る', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const service = serviceRoleClient()

  const shibuyaName = `渋谷のE2Eカフェ ${suffix}`
  const shinjukuName = `新宿のE2Eカフェ ${suffix}`

  const { data: shibuyaCafe, error: shibuyaError } = await service
    .from('cafes')
    .insert({
      name: shibuyaName,
      prefecture: '東京都',
      city: '渋谷区',
      area_code: 'JP-13-shibuya-ku',
      status: 'active',
      location: 'SRID=4326;POINT(139.7016 35.658)',
    })
    .select('id')
    .single()
  if (shibuyaError || !shibuyaCafe)
    throw new Error(`E2E カフェの作成に失敗: ${shibuyaError?.message}`)
  createdCafeIds.push(shibuyaCafe.id)

  const { data: shinjukuCafe, error: shinjukuError } = await service
    .from('cafes')
    .insert({
      name: shinjukuName,
      prefecture: '東京都',
      city: '新宿区',
      area_code: 'JP-13-shinjuku-ku',
      status: 'active',
      location: 'SRID=4326;POINT(139.7006 35.6896)',
    })
    .select('id')
    .single()
  if (shinjukuError || !shinjukuCafe)
    throw new Error(`E2E カフェの作成に失敗: ${shinjukuError?.message}`)
  createdCafeIds.push(shinjukuCafe.id)

  // 座標未収集のカフェは一覧に出てはいけない
  const { data: noLocationCafe, error: noLocationError } = await service
    .from('cafes')
    .insert({
      name: `座標無しE2Eカフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
    })
    .select('id')
    .single()
  if (noLocationError || !noLocationCafe)
    throw new Error(`E2E カフェの作成に失敗: ${noLocationError?.message}`)
  createdCafeIds.push(noLocationCafe.id)

  await page.goto('/map')

  // モバイル幅は初期表示が地図モードで、一覧はボタントグルで切り替えるまで hidden。
  // PC幅はこのタブ自体が無く常に両方表示なので、存在するときだけ切り替える
  const listTab = page.getByRole('tab', { name: '一覧' })
  if (await listTab.count()) await listTab.click()

  await expect(page.getByText(shibuyaName)).toBeVisible()
  await expect(page.getByText(shinjukuName)).toBeVisible()
  await expect(page.getByText(`座標無しE2Eカフェ ${suffix}`)).not.toBeVisible()

  await page.getByLabel('エリア').selectOption('JP-13-shinjuku-ku')

  await expect(page.getByText(shinjukuName)).toBeVisible()
  await expect(page.getByText(shibuyaName)).not.toBeVisible()
})

test('雰囲気タグで絞り込むと、該当タグの投稿を持つカフェだけが一覧に残る', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const service = serviceRoleClient()

  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  const quietName = `静かタグ付きE2Eカフェ ${suffix}`
  const noTagName = `タグ無しE2Eカフェ ${suffix}`

  const { data: quietCafe, error: quietError } = await service
    .from('cafes')
    .insert({
      name: quietName,
      prefecture: '東京都',
      city: '渋谷区',
      area_code: 'JP-13-shibuya-ku',
      status: 'active',
      location: 'SRID=4326;POINT(139.7016 35.658)',
    })
    .select('id')
    .single()
  if (quietError || !quietCafe) throw new Error(`E2E カフェの作成に失敗: ${quietError?.message}`)
  createdCafeIds.push(quietCafe.id)

  const { data: noTagCafe, error: noTagError } = await service
    .from('cafes')
    .insert({
      name: noTagName,
      prefecture: '東京都',
      city: '渋谷区',
      area_code: 'JP-13-shibuya-ku',
      status: 'active',
      location: 'SRID=4326;POINT(139.7018 35.6585)',
    })
    .select('id')
    .single()
  if (noTagError || !noTagCafe) throw new Error(`E2E カフェの作成に失敗: ${noTagError?.message}`)
  createdCafeIds.push(noTagCafe.id)

  const { data: post, error: postError } = await service
    .from('posts')
    .insert({
      author_id: user.userId,
      cafe_id: quietCafe.id,
      post_type: 'short',
      body_json: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `E2Eタグ絞り込み ${suffix}` }] },
        ],
      },
      status: 'published',
    })
    .select('id')
    .single()
  if (postError || !post) throw new Error(`E2E 投稿の作成に失敗: ${postError?.message}`)

  const { data: tag, error: tagError } = await service
    .from('tags')
    .select('id')
    .eq('slug', 'quiet')
    .single()
  if (tagError || !tag) throw new Error(`quiet タグが seed されていない: ${tagError?.message}`)

  const { error: tagLinkError } = await service
    .from('post_tags')
    .insert({ post_id: post.id, tag_id: tag.id })
  if (tagLinkError) throw new Error(`post_tags の作成に失敗: ${tagLinkError.message}`)

  await page.goto('/map')

  const listTab = page.getByRole('tab', { name: '一覧' })
  if (await listTab.count()) await listTab.click()

  await expect(page.getByText(quietName)).toBeVisible()
  await expect(page.getByText(noTagName)).toBeVisible()

  await page.getByLabel('雰囲気').selectOption('quiet')

  await expect(page.getByText(quietName)).toBeVisible()
  await expect(page.getByText(noTagName)).not.toBeVisible()
})
