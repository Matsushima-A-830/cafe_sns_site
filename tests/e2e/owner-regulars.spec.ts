import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_OWNER_REGULARS。実ブラウザでしか気づけない観点に絞る:
 *  - 認定モーダル → 確定 → DB反映・リロード後の永続化（落とし穴1: 保存数が
 *    post_bookmarks の本人限定SELECTに引っ張られて0のまま、という罠が再発していないか）
 *  - 認定候補タブから常連タブへ、リロード後も切り替わったまま残るか
 *   docs/design/wireframes/owner.md #S_OWNER_REGULARS
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

async function createVerifiedOwnerCafe(userId: string, suffix: string) {
  const service = serviceRoleClient()
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: `E2E常連カフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
      verified_owner_id: userId,
    })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`E2E カフェの作成に失敗: ${cafeError?.message}`)
  await service.from('profiles').update({ role: 'owner' }).eq('id', userId)
  return cafe.id as string
}

async function createCandidatePost(cafeId: string, authorId: string) {
  const service = serviceRoleClient()
  const { error } = await service.from('posts').insert({
    author_id: authorId,
    cafe_id: cafeId,
    post_type: 'short',
    body_json: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'E2E候補投稿' }] }],
    },
    status: 'published',
    published_at: new Date().toISOString(),
    bookmark_count: 3,
  })
  if (error) throw new Error(`E2E 候補投稿の作成に失敗: ${error.message}`)
}

test('認定候補を常連認定すると、常連タブに移りリロード後もDBに残る', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const owner = await createOnboardedUser(suffix)
  createdUserIds.push(owner.userId)
  const candidate = await createOnboardedUser(`${suffix}_c`)
  createdUserIds.push(candidate.userId)

  const cafeId = await createVerifiedOwnerCafe(owner.userId, suffix)
  createdCafeIds.push(cafeId)
  await createCandidatePost(cafeId, candidate.userId)

  await login(page, owner, `/owner/${cafeId}/regulars`)

  await page.getByRole('tab', { name: '認定候補' }).click()
  const candidateCard = page.getByText('保存 3').locator('..')
  await expect(candidateCard).toBeVisible()

  await page.getByRole('button', { name: '常連認定 ▶' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('一言メモ（任意）').fill('E2Eで認定しました')
  await dialog.getByRole('button', { name: '認定する' }).click()

  await expect(page.getByText('現在の常連: 1名')).toBeVisible()

  const { data } = await serviceRoleClient()
    .from('regular_customers')
    .select('note, revoked_at')
    .eq('cafe_id', cafeId)
    .eq('user_id', candidate.userId)
    .single()
  expect(data?.note).toBe('E2Eで認定しました')
  expect(data?.revoked_at).toBeNull()

  await page.reload()
  await expect(page.getByRole('tab', { name: '常連', selected: true })).toBeVisible()
  await expect(page.getByText('現在の常連: 1名')).toBeVisible()
})
