import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_OWNER_CAFE_EDIT。実ブラウザでしか気づけない観点に絞る:
 *  - 変更検知モーダル → 確定 → 保存後の永続化（リロードで消えないか）
 *  - status=closed のカフェでも本人は編集画面を開ける（落とし穴1: D55と同じ罠の再現防止）
 *   docs/design/wireframes/owner.md #s_owner_cafe_edit店舗情報編集
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

async function createApprovedOwnerCafe(
  userId: string,
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  const service = serviceRoleClient()
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: `E2E編集カフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
      ...overrides,
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

  return { id: cafe.id as string, name: `E2E編集カフェ ${suffix}` }
}

test('基本情報を編集し、変更検知モーダルで確定すると保存され、リロード後も残る', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const owner = await createOnboardedUser(suffix)
  createdUserIds.push(owner.userId)
  const cafe = await createApprovedOwnerCafe(owner.userId, suffix)
  createdCafeIds.push(cafe.id)

  await login(page, owner, `/owner/${cafe.id}/edit`)

  await page.getByLabel('店舗説明（任意）').fill('E2Eで更新した説明文です')
  await page.getByRole('button', { name: '保存する' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '変更内容を確認' })).toBeVisible()
  await expect(dialog.getByText('店舗説明', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '保存する' }).click()

  await expect(page.getByText('店舗情報を保存しました。')).toBeVisible()

  const { data } = await serviceRoleClient()
    .from('cafes')
    .select('description')
    .eq('id', cafe.id)
    .single()
  expect(data?.description).toBe('E2Eで更新した説明文です')
})

test('status=closed のカフェでも本人は編集画面を開ける', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const owner = await createOnboardedUser(suffix)
  createdUserIds.push(owner.userId)
  const cafe = await createApprovedOwnerCafe(owner.userId, suffix, { status: 'closed' })
  createdCafeIds.push(cafe.id)

  await login(page, owner, `/owner/${cafe.id}/edit`)

  await expect(page.getByRole('heading', { name: '店舗情報編集' })).toBeVisible()
  await expect(page.getByLabel('店名')).toHaveValue(cafe.name)

  // 営業時間の1行が曜日+開閉時刻+休業スイッチで幅を食う（cafe-edit-form.tsx の flex-wrap コメント参照）。
  // 390px前後のモバイル幅で横スクロールが発生していないかは実機でしか気づけない
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)
})
