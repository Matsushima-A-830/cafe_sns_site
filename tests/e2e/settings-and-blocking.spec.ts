import { expect, test } from '@playwright/test'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_SETTINGS のトグル永続化と、S_USER_PROFILE_PUBLIC → S_BLOCKED_USERS のブロック導線。
 *
 * ブロックは is_blocked_either_way（security definer）で両方向 404 を作る。
 * トリガー/RLS が効いていないと「ブロックした本人からは見えるが解除もできない」
 * ような中途半端な状態になり得るので、実ブラウザで一往復させて確かめる
 *   supabase/migrations/20260905130300_create_follows_and_blocks.sql
 *   docs/design/wireframes/mypage.md #S_SETTINGS #S_BLOCKED_USERS
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

test('位置情報の使用トグルを切るとリロード後も反映されたまま', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await login(page, user, '/settings')

  const toggle = page.getByRole('switch', { name: '位置情報の使用' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  // 見た目は楽観更新で即座に切り替わるが、updateSettings はまだ飛んでいる途中のことがある。
  // 保存中は全トグルを disabled にしているので、それが解けるのを待ってからリロードする
  // （でないと DB へ届く前にリロードしてしまい、元の値に戻って見える）
  await expect(toggle).toBeEnabled()

  await page.reload()
  await expect(page.getByRole('switch', { name: '位置情報の使用' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
})

test('公開プロフィールからブロックすると404になり、設定から解除すると再び見える', async ({
  page,
}) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-b`)
  const blocker = await createOnboardedUser(suffix)
  const target = await createOnboardedUser(`${suffix}_t`)
  createdUserIds.push(blocker.userId, target.userId)

  await login(page, blocker, `/users/${target.username}`)

  await page.getByRole('button', { name: 'ブロック' }).click()
  await page.getByRole('button', { name: 'ブロックする' }).click()

  // ブロック後はホームへ送られる（この画面自体が次回から404になるため）
  await expect(page).toHaveURL('/')

  // is_blocked_either_way が効いていれば、直接開いても404
  await page.goto(`/users/${target.username}`)
  await expect(page.getByRole('heading', { name: 'ユーザーが見つかりませんでした' })).toBeVisible()

  await page.goto('/settings/blocked')
  await expect(page.getByText(target.username, { exact: false })).toBeVisible()

  await page.getByRole('button', { name: '解除' }).click()
  await page.getByRole('button', { name: '解除する' }).click()
  await expect(page.getByText('ブロック中のユーザーはいません')).toBeVisible()

  // 一覧は楽観更新で即座に空になるが、解除の Server Action はまだ飛んでいる途中のことがある。
  // 完了を待たずに次のページへ移動すると DB への delete がまだ届いておらず、
  // 直後に開いたプロフィールが古いブロック状態のまま404し続ける
  await expect(page.getByText('ブロックを解除しました')).toBeAttached()

  await page.goto(`/users/${target.username}`)
  await expect(
    page.getByRole('heading', { name: 'ユーザーが見つかりませんでした' }),
  ).not.toBeVisible()
})
