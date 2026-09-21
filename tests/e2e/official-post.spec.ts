import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_POST_OFFICIAL（公式投稿、幹C-2）の一連の流れを実ブラウザで確認する。
 * 「予約→フォーム入力→公開確定→S_CAFE_DETAIL の『オーナーから』に反映」まで
 * 実際にUIを操作して通す — CLAUDE.md「UIは実際にブラウザで確認してから完了とする」
 *   docs/design/wireframes/composer.md #S_POST_OFFICIAL
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

/** owner-dashboard.spec.ts と同じ手順（承認済み申請 → verified_owner_id 付与） */
async function createApprovedOwnerCafe(userId: string, suffix: string) {
  const service = serviceRoleClient()
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: `E2E公式投稿カフェ ${suffix}`,
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

  return { id: cafe.id as string, name: `E2E公式投稿カフェ ${suffix}` }
}

test('オーナーは臨時休業の公式投稿を作成でき、カフェ詳細の「オーナーから」に反映される', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const owner = await createOnboardedUser(suffix)
  createdUserIds.push(owner.userId)
  const cafe = await createApprovedOwnerCafe(owner.userId, suffix)
  createdCafeIds.push(cafe.id)

  await login(page, owner, '/new/official')

  await expect(page.getByRole('heading', { name: `${cafe.name} 公式投稿` })).toBeVisible()
  await page.getByRole('link', { name: '臨時休業・営業時間変更' }).click()

  await expect(page).toHaveURL('/new/official/closure')
  await page.getByLabel('開始').fill('2026-09-25')
  await page.getByLabel('終了').fill('2026-09-26')
  await page.getByLabel('理由（任意）').fill('私用のためお休みさせていただきます')

  await page.getByRole('button', { name: '投稿する' }).click()

  await expect(page).toHaveURL(/\/new\/success/)
  await expect(page.getByRole('heading', { name: '投稿しました！' })).toBeVisible()

  await page.getByRole('link', { name: '投稿を見る' }).click()
  await expect(page.getByText('✓公式').first()).toBeVisible()
  await expect(page.getByText('臨時休業').first()).toBeVisible()
  await expect(page.getByText('私用のためお休みさせていただきます').first()).toBeVisible()

  await page.goto(`/cafes/${cafe.id}`)
  const ownerSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'オーナーから' }) })
    .last()
  await expect(ownerSection).toBeVisible()
  await expect(ownerSection.getByText('✓公式').first()).toBeVisible()
})
