import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'

/**
 * S_EXPLORE「近くのカフェ」タブ（pending-items D25）。実ブラウザでしか気づけない観点に絞る:
 *  - Geolocation の座標が実際に getNearbyCafes 経由でフィードの絞り込みに使われているか
 *    （URLへのlat/lng反映は client component 経由なので、配線が壊れても見た目のタブは動いているように見える）
 *  - 座標未収集のカフェの投稿は一覧に出ない
 *   docs/design/wireframes/browsing.md #S_EXPLORE
 */

const createdCafeIds: string[] = []
const createdUserIds: string[] = []
const createdPostIds: string[] = []

test.afterAll(async () => {
  const service = serviceRoleClient()
  if (createdPostIds.length > 0) await service.from('posts').delete().in('id', createdPostIds)
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdCafeIds.length = 0
  createdUserIds.length = 0
  createdPostIds.length = 0
})

test('現在地の近くのカフェの投稿だけが「近くのカフェ」タブに出る', async ({ page, baseURL }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const service = serviceRoleClient()
  const author = await createOnboardedUser(suffix)
  createdUserIds.push(author.userId)

  const nearExcerpt = `E2E近くの投稿 ${suffix}`
  const noLocationExcerpt = `E2E座標未収集カフェの投稿 ${suffix}`

  const { data: nearCafe, error: nearError } = await service
    .from('cafes')
    .insert({
      name: `渋谷のE2E近くカフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
      location: 'SRID=4326;POINT(139.7016 35.658)',
    })
    .select('id')
    .single()
  if (nearError || !nearCafe) throw new Error(`E2E カフェの作成に失敗: ${nearError?.message}`)
  createdCafeIds.push(nearCafe.id)

  const { data: noLocationCafe, error: noLocationError } = await service
    .from('cafes')
    .insert({
      name: `座標未収集のE2Eカフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
    })
    .select('id')
    .single()
  if (noLocationError || !noLocationCafe) {
    throw new Error(`E2E カフェの作成に失敗: ${noLocationError?.message}`)
  }
  createdCafeIds.push(noLocationCafe.id)

  const insertPost = async (cafeId: string, excerpt: string) => {
    const { data, error } = await service
      .from('posts')
      .insert({
        author_id: author.userId,
        cafe_id: cafeId,
        body_json: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: excerpt }] }],
        },
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`E2E 投稿の作成に失敗: ${error?.message}`)
    createdPostIds.push(data.id as string)
  }
  await insertPost(nearCafe.id, nearExcerpt)
  await insertPost(noLocationCafe.id, noLocationExcerpt)

  await page.context().grantPermissions(['geolocation'], { origin: baseURL })
  await page.context().setGeolocation({ latitude: 35.658, longitude: 139.7016 })

  await page.goto('/explore?tab=nearby')

  await expect(page.getByText(nearExcerpt)).toBeVisible()
  await expect(page.getByText(noLocationExcerpt)).not.toBeVisible()
})

test('Geolocation を拒否してもフォールバック中心の案内を出して続行する', async ({
  page,
  context,
}) => {
  await context.clearPermissions()
  await page.goto('/explore?tab=nearby')

  await expect(
    page.getByText('現在地を取得中です。見つかるまでは新宿駅周辺のカフェを表示しています。'),
  ).toBeVisible()
})
