import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, createPublishedPost, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * S_POST_DETAIL のコメントスレッド（comment-list.tsx / comment-form.tsx）を実ブラウザで
 * 確認する。ロジック自体は統合テスト（tests/integration/comments.test.ts）とコンポーネント
 * テスト（comment-list.test.tsx / comment-form.test.tsx、モック経由）で覆われているため、
 * ここでは実ブラウザでしか起きないこと（表示の反映・リロード後の永続化）に絞る
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 *   supabase/migrations/20260920120000_create_comments.sql
 */

const createdUserIds: string[] = []
const createdCafeIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds, cafeIds: createdCafeIds })
  createdUserIds.length = 0
  createdCafeIds.length = 0
})

async function setup(projectName: string, label: string) {
  const suffix = uniqueSuffix(`${projectName}_${label}`)
  const author = await createOnboardedUser(suffix)
  createdUserIds.push(author.userId)
  const post = await createPublishedPost(author.userId, suffix)
  return { suffix, author, post }
}

test('コメントを投稿すると一覧末尾に表示され、リロードしても残る', async ({ page }) => {
  const { post } = await setup(test.info().project.name, 'post')

  const commenter = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_c`))
  createdUserIds.push(commenter.userId)

  await login(page, commenter, `/posts/${post.id}`)

  await expect(page.getByRole('heading', { name: 'コメント 0件' })).toBeVisible()

  const textarea = page.getByLabel('コメントを書く')
  await textarea.fill('E2Eコメント本文')
  await page.getByRole('button', { name: 'コメントする' }).click()

  await expect(page.getByText('E2Eコメント本文')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'コメント 1件' })).toBeVisible()
  // 送信後は自分で入力したフォームが空に戻る
  await expect(textarea).toHaveValue('')

  await page.reload()
  await expect(page.getByText('E2Eコメント本文')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'コメント 1件' })).toBeVisible()
})

test('返信を投稿すると親コメントの下に表示され、件数に反映される', async ({ page }) => {
  const { post } = await setup(test.info().project.name, 'reply')

  const commenter = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_c`))
  createdUserIds.push(commenter.userId)
  const replier = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_r`))
  createdUserIds.push(replier.userId)

  const service = serviceRoleClient()
  const { data: parent, error } = await service
    .from('comments')
    .insert({ post_id: post.id, author_id: commenter.userId, body: '元コメント' })
    .select('id')
    .single()
  if (error || !parent) throw new Error(`E2E 親コメントの作成に失敗: ${error?.message}`)

  await login(page, replier, `/posts/${post.id}`)
  await expect(page.getByRole('heading', { name: 'コメント 1件' })).toBeVisible()

  await page.getByRole('button', { name: '返信' }).click()
  const replyTextarea = page.getByLabel('返信を書く')
  await replyTextarea.fill('E2E返信本文')
  await page.getByRole('button', { name: '返信する' }).click()

  await expect(page.getByRole('heading', { name: 'コメント 2件' })).toBeVisible()

  // 返信は親コメントと同じ <li>（インデント表示）に入っている
  const parentItem = page.locator('li').filter({ hasText: '元コメント' })
  await expect(parentItem.getByText('E2E返信本文')).toBeVisible()
})

test('返信付きコメントは本人でも削除ボタンが出ない', async ({ page }) => {
  const { post } = await setup(test.info().project.name, 'guard')

  const commenter = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_c`))
  createdUserIds.push(commenter.userId)
  const replier = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_r`))
  createdUserIds.push(replier.userId)

  const service = serviceRoleClient()
  const { data: parent, error } = await service
    .from('comments')
    .insert({ post_id: post.id, author_id: commenter.userId, body: '返信される元コメント' })
    .select('id')
    .single()
  if (error || !parent) throw new Error(`E2E 親コメントの作成に失敗: ${error?.message}`)

  const { error: replyError } = await service.from('comments').insert({
    post_id: post.id,
    author_id: replier.userId,
    parent_id: parent.id,
    body: '先についた返信',
  })
  if (replyError) throw new Error(`E2E 返信の作成に失敗: ${replyError.message}`)

  await login(page, commenter, `/posts/${post.id}`)

  const parentItem = page.locator('li').filter({ hasText: '返信される元コメント' })
  await expect(parentItem.getByText('先についた返信')).toBeVisible()
  // 返信が付いた自分のコメントには削除ボタンを出さない（COMMENT_HAS_REPLIES）
  await expect(parentItem.getByRole('button', { name: '削除' })).toHaveCount(0)
})

test('自分のコメントを削除すると一覧から消え、件数が減る', async ({ page }) => {
  const { post } = await setup(test.info().project.name, 'delete')

  const commenter = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_c`))
  createdUserIds.push(commenter.userId)

  await login(page, commenter, `/posts/${post.id}`)

  const textarea = page.getByLabel('コメントを書く')
  await textarea.fill('削除されるコメント')
  await page.getByRole('button', { name: 'コメントする' }).click()
  await expect(page.getByRole('heading', { name: 'コメント 1件' })).toBeVisible()

  await page.getByRole('button', { name: '削除' }).click()
  await expect(page.getByText('本当に削除しますか？')).toBeVisible()
  await page.getByRole('button', { name: '削除する' }).click()

  await expect(page.getByText('削除されるコメント')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'コメント 0件' })).toBeVisible()

  // 件数・一覧は削除リクエストの完了前に楽観更新で先に変わる。完了を待たずにリロードすると
  // 送信中のリクエストが破棄され、WebKit では実際に削除が反映されないまま残る（D34 likes.spec.ts と同じ理由）
  await expect(page.getByText('処理中')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('削除されるコメント')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'コメント 0件' })).toBeVisible()
})

test('オーナー公式コメントには「オーナー公式」バッジが出る', async ({ page }) => {
  const { suffix, post } = await setup(test.info().project.name, 'official')

  const owner = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_o`))
  createdUserIds.push(owner.userId)

  const service = serviceRoleClient()
  // 公式コメントの資格（guard_comments_official_owner）は
  // 「投稿の cafe_id の verified_owner_id = コメント投稿者」で判定される
  const { data: cafe, error: cafeError } = await service
    .from('cafes')
    .insert({
      name: `E2E公式コメントカフェ ${suffix}`,
      prefecture: '東京都',
      city: '渋谷区',
      status: 'active',
      verified_owner_id: owner.userId,
    })
    .select('id')
    .single()
  if (cafeError || !cafe) throw new Error(`E2E カフェの作成に失敗: ${cafeError?.message}`)
  createdCafeIds.push(cafe.id)

  const { error: postUpdateError } = await service
    .from('posts')
    .update({ cafe_id: cafe.id })
    .eq('id', post.id)
  if (postUpdateError) throw new Error(`E2E 投稿のcafe_id更新に失敗: ${postUpdateError.message}`)

  const { error: commentError } = await service.from('comments').insert({
    post_id: post.id,
    author_id: owner.userId,
    body: 'オーナーからの公式返信',
    is_official: true,
  })
  if (commentError) throw new Error(`E2E 公式コメントの作成に失敗: ${commentError.message}`)

  const viewer = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_v`))
  createdUserIds.push(viewer.userId)
  await login(page, viewer, `/posts/${post.id}`)

  const officialItem = page.locator('li').filter({ hasText: 'オーナーからの公式返信' })
  await expect(officialItem.getByText('オーナー公式')).toBeVisible()
})

test('21件目以降は「もっと見る」クリックで表示され、ボタンが消える', async ({ page }) => {
  const { post } = await setup(test.info().project.name, 'more')

  const commenter = await createOnboardedUser(uniqueSuffix(`${test.info().project.name}_c`))
  createdUserIds.push(commenter.userId)

  const service = serviceRoleClient()
  const rows = Array.from({ length: 21 }, (_, i) => ({
    post_id: post.id,
    author_id: commenter.userId,
    body: `E2E一括コメント ${String(i + 1).padStart(2, '0')}`,
  }))
  const { error } = await service.from('comments').insert(rows)
  if (error) throw new Error(`E2E コメント一括作成に失敗: ${error.message}`)

  await login(page, commenter, `/posts/${post.id}`)
  await expect(page.getByRole('heading', { name: 'コメント 21件' })).toBeVisible()

  // 21件が同一トランザクションの insert で created_at が揃うため、どの1件が2ページ目に
  // 回るかは id の並びに依存し特定できない。本数だけで「ページサイズ=20」を確認する
  const commentTexts = page.getByText(/^E2E一括コメント \d{2}$/)
  await expect(commentTexts).toHaveCount(20)

  const loadMore = page.getByRole('button', { name: 'もっと見る' })
  await expect(loadMore).toBeVisible()
  await loadMore.click()

  await expect(commentTexts).toHaveCount(21)
  await expect(page.getByRole('button', { name: 'もっと見る' })).toHaveCount(0)
})
