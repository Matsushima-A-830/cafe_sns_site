import { expect, type Locator, test } from '@playwright/test'
import { cleanup, createOnboardedUser, createPublishedPost, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * 投稿詳細（S_POST_DETAIL）とフィードのいいね。
 *
 * 他人の投稿にいいねする経路を実ブラウザで通す。posts.like_count を維持する
 * トリガーが security definer でないと「自分の投稿では増えるが他人の投稿では
 * 増えない」という形で壊れ、画面上は成功に見えたままになる
 *   supabase/migrations/20260919120000_create_likes.sql
 *   docs/design/wireframes/browsing.md #S_POST_DETAIL
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

/**
 * いいねボタンは送信中 `disabled` にせず `handleClick` の `isPending` ガードで連打を止める。
 * `router.refresh()` の完了まで押下は黙って捨てられるので、次の操作前に必ず待つ
 *   components/features/posts/like-button.tsx
 */
async function waitIdle(button: Locator) {
  await expect(button).toHaveAttribute('aria-busy', 'false')
}

/** 作った端から登録する（片方が失敗しても回収できるよう並列化しない） */
async function setup(projectName: string) {
  const suffix = uniqueSuffix(projectName)

  const author = await createOnboardedUser(suffix)
  createdUserIds.push(author.userId)

  const liker = await createOnboardedUser(`${suffix}_l`)
  createdUserIds.push(liker.userId)

  const post = await createPublishedPost(author.userId, suffix)

  return { author, liker, post }
}

test('他人の投稿にいいねするとリロード後も残り、件数が増える', async ({ page }) => {
  const { liker, post } = await setup(test.info().project.name)

  await login(page, liker, `/posts/${post.id}`)

  // 「いいね」→「いいね済み」でラベル自体が変わるので、どちらにも当たる名前で掴む
  const like = page.getByRole('button', { name: /いいね(済み)?\s*0*\d+件/ })
  await expect(like).toHaveAttribute('aria-pressed', 'false')
  await expect(like).toHaveText(/いいね\s*0件/)

  await like.click()
  // 色だけで状態を伝えていないこと（ラベルと aria-pressed の両方）を確かめる
  await expect(like).toHaveAttribute('aria-pressed', 'true')
  await expect(like).toHaveText(/いいね済み\s*1件/)

  // aria-pressed と件数は楽観更新で同期的に変わる。書き込みの完了を待たずにリロードすると
  // 送信中のリクエストが破棄され、WebKit では実際に取りこぼす
  await waitIdle(like)

  // ここが本題。楽観更新ではなくサーバー描画の値を見る。トリガーが効いていないと
  // 「いいね済み」だけ残って件数が 0件 に戻る
  await page.reload()
  const afterReload = page.getByRole('button', { name: /いいね済み\s*1件/ })
  await expect(afterReload).toHaveAttribute('aria-pressed', 'true')
})

test('いいねを外すと件数が戻り、リロードしても戻ったまま', async ({ page }) => {
  const { liker, post } = await setup(`${test.info().project.name}-x`)

  await login(page, liker, `/posts/${post.id}`)

  const like = page.getByRole('button', { name: /いいね(済み)?\s*0*\d+件/ })
  await like.click()
  await expect(like).toHaveText(/いいね済み\s*1件/)
  await waitIdle(like)

  await like.click()
  await expect(like).toHaveAttribute('aria-pressed', 'false')
  await expect(like).toHaveText(/いいね\s*0件/)
  await waitIdle(like)

  await page.reload()
  await expect(page.getByRole('button', { name: /いいね\s*0件/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('投稿詳細でのいいねがプロフィールの投稿カードにも出る', async ({ page }) => {
  const { author, liker, post } = await setup(`${test.info().project.name}-c`)

  await login(page, liker, `/posts/${post.id}`)

  const like = page.getByRole('button', { name: /いいね(済み)?\s*0*\d+件/ })
  await like.click()
  await waitIdle(like)

  // カードと詳細は同じ LikeButton を使う。一覧側は埋め込み（my_like）で状態を取るため
  // 別経路になる — `!inner` を付けると未いいねの投稿が一覧から消える
  await page.goto(`/users/${author.username}`)
  await expect(page.getByRole('button', { name: /いいね済み\s*1件/ })).toBeVisible()
})
