import { expect, type Page, test } from '@playwright/test'
import { cleanup, createOnboardedUser, type E2EUser, uniqueSuffix } from './helpers/data'
import { buildRealPlainJpeg } from './helpers/gps-photo'
import { login } from './helpers/login'

/**
 * S_POST_BLOG。TiptapEditor（本文JSON保存・本文埋め込み画像）は jsdom
 * ユニットテストでは検証できず、D34対応（ShortComposer分）以来、実ブラウザで
 * 一度も触られていなかった。ここでの主眼は「タイトル+本文入力〜投稿確定〜詳細表示」
 * と「下書き保存→復元」が実ブラウザで一往復すること
 *
 * 本文埋め込み画像（Tiptapツールバー経由）は post_images 行を作らないため、
 * 投稿カードのサムネイルには使われない。サムネイルはアイキャッチ画像欄（D68）経由のみ
 *   docs/product/pending-items.md D68
 */

const createdUserIds: string[] = []

test.afterAll(async () => {
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
})

function draftKeyFromUrl(page: Page): string {
  const key = new URL(page.url()).searchParams.get('draft')
  if (!key) throw new Error('draft キーがURLに載っていない')
  return key
}

/** useComposer が mount 直後に ?draft= をURLへ付け足し、login() の厳密一致アサーションと
 * 競合するため、ログインは '/' で済ませてから遷移する */
async function loginAndOpenComposer(page: Page, user: E2EUser) {
  await login(page, user)
  await page.goto('/new/blog')
}

/** 本文埋め込み画像は alt="" かつ src が blob: を経由しない（公開URLを直接埋め込む）
 * ため、ShortComposer の waitForUploadedImage() とは待ち方が異なる */
async function waitForEmbeddedImage(page: Page) {
  const image = page.locator('.ProseMirror img')
  await expect(image).toHaveAttribute('src', /post-images/, { timeout: 15_000 })
  return image
}

test('タイトルと本文を入力して公開すると、詳細画面にタイトル・本文が表示される', async ({
  page,
}) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  await page.getByLabel('タイトル').fill('E2Eブログのタイトル')
  const body = page.locator('[aria-label="本文"]')
  await body.fill('E2Eブログの本文です。')
  // 書式が実際に反映されるか確認するため、入力済みのテキストを選択してから太字を適用する。
  // キーボードの ControlOrMeta+a はモバイルSafariでは選択が効かないため、トリプルクリックで選択する
  await body.locator('p').click({ clickCount: 3 })
  await page.getByRole('button', { name: '太字' }).click()

  const submitButton = page.getByRole('button', { name: '公開する' })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()

  await expect(page).toHaveURL(/\/new\/success/)
  await page.getByRole('link', { name: '投稿を見る' }).click()
  await expect(page).toHaveURL(/\/posts\//)

  await expect(page.getByRole('heading', { name: 'E2Eブログのタイトル', level: 1 })).toBeVisible()
  await expect(page.locator('article strong')).toHaveText('E2Eブログの本文です。')
})

test('タイトルまたは本文が空だと公開できない', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-empty`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  const submitButton = page.getByRole('button', { name: '公開する' })
  await expect(submitButton).toBeDisabled()

  await page.getByLabel('タイトル').fill('タイトルだけ')
  await expect(submitButton).toBeDisabled()

  await page.getByLabel('タイトル').fill('')
  const body = page.locator('[aria-label="本文"]')
  await body.fill('本文だけ')
  await expect(submitButton).toBeDisabled()
})

test('本文に画像を挿入すると、詳細画面でも画像が表示される', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-image`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  await page.getByLabel('タイトル').fill('画像入りブログ')
  const body = page.locator('[aria-label="本文"]')
  await body.fill('本文の前置き')

  const fileInput = page.getByLabel('本文に画像を挿入')
  await fileInput.setInputFiles({
    name: 'embedded.jpg',
    mimeType: 'image/jpeg',
    buffer: await buildRealPlainJpeg(page),
  })
  await waitForEmbeddedImage(page)

  const submitButton = page.getByRole('button', { name: '公開する' })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()

  await expect(page).toHaveURL(/\/new\/success/)
  await page.getByRole('link', { name: '投稿を見る' }).click()
  await expect(page).toHaveURL(/\/posts\//)

  await expect(page.locator('article img').first()).toHaveAttribute('src', /post-images/, {
    timeout: 15_000,
  })
})

test('下書きに保存して離脱すると、リロード後もタイトル・本文・画像付きで復元される', async ({
  page,
}) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-draft`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  await page.getByLabel('タイトル').fill('下書きのタイトル')
  const body = page.locator('[aria-label="本文"]')
  await body.fill('下書きの本文')

  const fileInput = page.getByLabel('本文に画像を挿入')
  await fileInput.setInputFiles({
    name: 'draft.jpg',
    mimeType: 'image/jpeg',
    buffer: await buildRealPlainJpeg(page),
  })
  await waitForEmbeddedImage(page)

  const draftKey = draftKeyFromUrl(page)

  await page.getByRole('button', { name: 'キャンセル' }).click()
  await page.getByRole('button', { name: '下書きに保存して離脱' }).click()
  await expect(page).toHaveURL('/')

  await page.goto(`/new/blog?draft=${draftKey}`)
  await expect(page.getByLabel('タイトル')).toHaveValue('下書きのタイトル')
  await expect(page.getByText('下書きの本文')).toBeVisible()
  await waitForEmbeddedImage(page)
})

test('アイキャッチ画像を選択して公開すると、詳細画面にその画像が表示される', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-eyecatch`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  await page.getByLabel('タイトル').fill('アイキャッチ付きブログ')
  const body = page.locator('[aria-label="本文"]')
  await body.fill('アイキャッチ画像のテスト本文')

  const eyecatchInput = page.getByLabel('追加')
  await eyecatchInput.setInputFiles({
    name: 'eyecatch.jpg',
    mimeType: 'image/jpeg',
    buffer: await buildRealPlainJpeg(page),
  })
  const eyecatchPreview = page.getByAltText('選択した写真 1枚目')
  await expect(eyecatchPreview).toHaveAttribute('src', /^blob:/, { timeout: 15_000 })

  const submitButton = page.getByRole('button', { name: '公開する' })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()

  await expect(page).toHaveURL(/\/new\/success/)
  await page.getByRole('link', { name: '投稿を見る' }).click()
  await expect(page).toHaveURL(/\/posts\//)

  const detailImageSrc = await page.locator('figure img').first().getAttribute('src')
  expect(detailImageSrc).toMatch(/post-images/)
})

test('プレビューを開くとタイトルと本文が見た目通りに表示される', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-preview`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  await page.getByLabel('タイトル').fill('プレビュー確認タイトル')
  const body = page.locator('[aria-label="本文"]')
  await body.fill('プレビュー確認の本文')

  await page.getByRole('button', { name: 'プレビュー' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('プレビュー確認タイトル')).toBeVisible()
  await expect(dialog.getByText('プレビュー確認の本文')).toBeVisible()
})
