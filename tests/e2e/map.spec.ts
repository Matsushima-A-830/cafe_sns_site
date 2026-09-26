import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, uniqueSuffix } from './helpers/data'

/**
 * S_MAP。実ブラウザでしか気づけない観点に絞る:
 *  - 一覧とフィルタ（エリア）が実際に nearby_cafes 経由で連動しているか
 *    （searchNearbyCafes の配線が壊れても見た目のフォームは動いているように見える）
 *  - 座標の無いカフェが一覧に出ない（location NULL を除外する where 句の回帰防止）
 *   docs/design/wireframes/browsing.md #S_MAP
 */

const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ cafeIds: createdCafeIds })
  createdCafeIds.length = 0
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

  await expect(page.getByText(shibuyaName)).toBeVisible()
  await expect(page.getByText(shinjukuName)).toBeVisible()
  await expect(page.getByText(`座標無しE2Eカフェ ${suffix}`)).not.toBeVisible()

  await page.getByLabel('エリア').selectOption('JP-13-shinjuku-ku')

  await expect(page.getByText(shinjukuName)).toBeVisible()
  await expect(page.getByText(shibuyaName)).not.toBeVisible()
})
