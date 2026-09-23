import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_OWNER_DASHBOARD。承認後にオーナーが実際にたどり着けること、
 * 他人のカフェの経営情報は role='owner' でも見えないことを実ブラウザで確かめる
 *   lib/owner/dashboard.ts の getOwnerDashboard が verified_owner_id を検証する部分
 *   docs/design/wireframes/owner.md #s_owner_dashboard経営者ダッシュボード
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

/** cafe_owner_verifications の CAFE_ALREADY_CLAIMED ガードを避けるため、
 * 承認済み申請行を先に作ってから verified_owner_id を付与する（本番の承認フローと同じ順序） */
async function createApprovedOwnerCafe(userId: string, suffix: string) {
  const service = serviceRoleClient()
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: `E2E経営カフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
    })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`E2E カフェの作成に失敗: ${cafeError?.message}`)

  const { error: verificationError } = await service.from('cafe_owner_verifications').insert({
    user_id: userId,
    cafe_id: cafe.id,
    status: 'approved',
    document_urls: [
      { type: 'business_license', path: `${userId}/${suffix}/a.jpg` },
      { type: 'notification_of_business', path: `${userId}/${suffix}/b.pdf` },
    ],
    contact_email: `owner-${suffix}@example.test`,
    reviewed_at: '2026-09-08T00:00:00Z',
  })
  if (verificationError)
    throw new Error(`E2E オーナー認証申請の作成に失敗: ${verificationError.message}`)

  const { error: claimError } = await service
    .from('cafes')
    .update({ verified_owner_id: userId })
    .eq('id', cafe.id)
  if (claimError) throw new Error(`E2E verified_owner_id の設定に失敗: ${claimError.message}`)
  await service.from('profiles').update({ role: 'owner' }).eq('id', userId)

  return { id: cafe.id as string, name: `E2E経営カフェ ${suffix}` }
}

test('承認済みオーナーはダッシュボードで今週のサマリーとメニューを見られる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const owner = await createOnboardedUser(suffix)
  createdUserIds.push(owner.userId)
  const cafe = await createApprovedOwnerCafe(owner.userId, suffix)
  createdCafeIds.push(cafe.id)

  await login(page, owner, `/owner/${cafe.id}`)

  await expect(page.getByRole('heading', { name: `${cafe.name} ダッシュボード` })).toBeVisible()
  await expect(page.getByText('✓ 公式認証済み')).toBeVisible()
  await expect(page.getByText('今週のサマリー')).toBeVisible()
  await expect(page.getByRole('link', { name: 'ダッシュボードへ進む' })).toHaveCount(0)
  // 「店舗情報を編集」は S_OWNER_CAFE_EDIT 実装（D52）でリンクが開通した
  await expect(page.getByRole('link', { name: '店舗情報を編集' })).toBeVisible()
  // 未実装の残りメニューはリンクを張らない（準備中ラベルのみ）
  await expect(page.getByText('準備中').first()).toBeVisible()
})

test('他人のカフェのダッシュボードは role=owner でも404になる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const cafeOwner = await createOnboardedUser(`${suffix}_a`)
  createdUserIds.push(cafeOwner.userId)
  const cafe = await createApprovedOwnerCafe(cafeOwner.userId, suffix)
  createdCafeIds.push(cafe.id)

  const otherOwner = await createOnboardedUser(`${suffix}_b`)
  createdUserIds.push(otherOwner.userId)
  const service = serviceRoleClient()
  await service.from('profiles').update({ role: 'owner' }).eq('id', otherOwner.userId)

  await login(page, otherOwner, '/')
  // (owner) route group には not-found.tsx が無く（owner/claim・owner/pending と同じ状態）、
  // Next.js既定の英語404にフォールバックする。文言の日本語化は D51 で別途扱う。
  // ここでは 404 ステータスとダッシュボードの中身が出ないことを確認する
  const response = await page.goto(`/owner/${cafe.id}`)
  expect(response?.status()).toBe(404)
  await expect(page.getByText('今週のサマリー')).toHaveCount(0)
})

test('S_OWNER_PENDING の承認済み表示からダッシュボードへ遷移できる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const owner = await createOnboardedUser(suffix)
  createdUserIds.push(owner.userId)
  const cafe = await createApprovedOwnerCafe(owner.userId, suffix)
  createdCafeIds.push(cafe.id)

  await login(page, owner, '/owner/pending')

  await expect(page.getByRole('heading', { name: '承認されました' })).toBeVisible()
  await page.getByRole('link', { name: 'ダッシュボードへ進む' }).click()
  await expect(page).toHaveURL(`/owner/${cafe.id}`)
  await expect(page.getByRole('heading', { name: `${cafe.name} ダッシュボード` })).toBeVisible()
})
