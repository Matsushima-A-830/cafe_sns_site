import { expect, test } from '@playwright/test'
import { cleanup, createDraftDirect, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_DRAFTS の一覧そのもの。これまで composer の resume() ロジック自体は
 * composer-short.spec.ts / composer-blog.spec.ts で `?draft=` への直接ジャンプとして
 * 検証済みだが、一覧からボタンを実際にクリックして辿る導線（draftResumeHref の組み立て・
 * 一覧→composerの画面遷移）と、削除確認ダイアログ・他人の下書きが混ざらないことは
 * 一度も実ブラウザで確認されていない
 *   components/features/drafts/draft-list.tsx
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

test('下書きが一覧に表示され、「続きを書く」からcomposerに遷移して内容が復元される', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  const title = `下書きのタイトル${suffix}`
  const bodyText = `下書きの本文${suffix}`
  await createDraftDirect(user.userId, suffix, { postType: 'blog', title, bodyText })

  await login(page, user, '/me/drafts')

  const item = page.getByRole('listitem').filter({ hasText: title })
  await expect(item).toBeVisible()

  await item.getByRole('link', { name: '続きを書く' }).click()

  await expect(page).toHaveURL(/\/new\/blog\?draft=/)
  await expect(page.getByLabel('タイトル')).toHaveValue(title)
  await expect(page.getByText(bodyText)).toBeVisible()
})

test('確認してから削除すると一覧から消え、リロードしても戻らない（他の下書きは残る）', async ({
  page,
}) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-del`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  const keepTitle = `残す下書き${suffix}`
  const deleteTitle = `消す下書き${suffix}`
  await createDraftDirect(user.userId, `${suffix}-keep`, { title: keepTitle })
  await createDraftDirect(user.userId, `${suffix}-del`, { title: deleteTitle })

  await login(page, user, '/me/drafts')

  // 複数の下書きがあると削除ボタンのアクセシブルネームが重複するため、
  // 対象の <li> にスコープしてから探す
  const targetItem = page.getByRole('listitem').filter({ hasText: deleteTitle })
  await targetItem.getByRole('button', { name: '削除' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('この下書きを削除しますか？')).toBeVisible()
  await dialog.getByRole('button', { name: '削除する' }).click()

  await expect(page.getByRole('listitem').filter({ hasText: deleteTitle })).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: keepTitle })).toBeVisible()

  // 削除も楽観更新で即座に一覧から消える。Server Actions の完了（live region の
  // 「下書きを削除しました」）を待たずにリロードすると、まだDBに届いていない
  // delete がリロードで破棄され、下書きが復活する
  await expect(page.getByText('下書きを削除しました')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('listitem').filter({ hasText: deleteTitle })).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: keepTitle })).toBeVisible()
})

test('他人の下書きは一覧に混ざらない', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-rls`)
  const viewer = await createOnboardedUser(suffix)
  const other = await createOnboardedUser(`${suffix}-other`)
  createdUserIds.push(viewer.userId, other.userId)

  const viewerTitle = `自分の下書き${suffix}`
  const otherTitle = `他人の下書き${suffix}`
  await createDraftDirect(viewer.userId, suffix, { title: viewerTitle })
  await createDraftDirect(other.userId, `${suffix}-other`, { title: otherTitle })

  await login(page, viewer, '/me/drafts')

  await expect(page.getByRole('listitem').filter({ hasText: viewerTitle })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: otherTitle })).toHaveCount(0)
})
