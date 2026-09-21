import { expect, test } from '@playwright/test'
import {
  cleanup,
  createOnboardedAdmin,
  createOnboardedUser,
  createPendingOwnerVerification,
  uniqueSuffix,
} from './helpers/data'
import { login } from './helpers/login'

/**
 * S_ADMIN_OWNER_REVIEW。承認/却下が cafes.verified_owner_id・profiles.role・
 * notifications への副作用まで含めて実際に通るかを確かめる。
 * notifications_insert_admin（20260921090000）の type 制限を実ブラウザ経由の
 * Server Action 呼び出しで通すのが本題 — 統合テストは直接INSERTで確認済みだが、
 * ここでは resolveOwnerVerification 経由で同じ経路を実際に踏む
 *   docs/design/screen-flow.md #6-カフェ経営者フロー
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

test('承認すると審査中一覧から消え、対応済みと表示される', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const admin = await createOnboardedAdmin(suffix)
  createdUserIds.push(admin.userId)
  const applicant = await createOnboardedUser(`${suffix}_a`)
  createdUserIds.push(applicant.userId)
  const verification = await createPendingOwnerVerification(applicant.userId, suffix)

  await login(page, admin, `/admin/verifications/${verification.id}`)

  await expect(page.getByRole('heading', { name: verification.cafeName })).toBeVisible()
  await page.getByRole('button', { name: '承認する' }).click()
  await page.getByRole('button', { name: '実行する' }).click()

  await expect(page).toHaveURL('/admin/verifications')
  await page.goto(`/admin/verifications/${verification.id}`)
  await expect(page.getByText('この申請は既に対応済みです。')).toBeVisible()
})

test('却下は理由メモが空だと実行できない', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-r`)
  const admin = await createOnboardedAdmin(suffix)
  createdUserIds.push(admin.userId)
  const applicant = await createOnboardedUser(`${suffix}_a`)
  createdUserIds.push(applicant.userId)
  const verification = await createPendingOwnerVerification(applicant.userId, suffix)

  await login(page, admin, `/admin/verifications/${verification.id}`)

  await page.getByRole('button', { name: '却下する' }).click()
  const confirm = page.getByRole('button', { name: '実行する' })
  await expect(confirm).toBeDisabled()
  await expect(page.getByText('却下理由を入力してください')).toBeVisible()

  // 通知欄はダイアログの外にあり、開いている間はオーバーレイの裏で操作できない
  // （Radix Dialog のフォーカストラップ）ので、一度キャンセルして入力し直す
  await page.getByRole('button', { name: 'キャンセル' }).click()
  await page.getByLabel(/審査メモ/).fill('書類の氏名が一致しません')
  await page.getByRole('button', { name: '却下する' }).click()
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(page).toHaveURL('/admin/verifications')
})
