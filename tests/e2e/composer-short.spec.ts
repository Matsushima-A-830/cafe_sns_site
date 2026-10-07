import { expect, type Page, test } from '@playwright/test'
import { detectGpsExif } from '../../lib/storage/exif-gps-check'
import { POST_IMAGE_BUCKET } from '../../lib/storage/post-images'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, type E2EUser, uniqueSuffix } from './helpers/data'
import { buildRealGpsJpeg, buildRealPlainJpeg } from './helpers/gps-photo'
import { login } from './helpers/login'

/**
 * S_POST_SHORT。processPostImage（EXIF除去・WebP変換）・署名付きURL直PUT・
 * 15秒デバウンス自動保存は jsdom/ユニットテストで検証できず、PR #29/#30 以来
 * 実ブラウザで一度も触られていなかった（D34対応案b）。
 * EXIF除去自体は canvas 再描画の副作用で構造的に落ちるため、ここでの主眼は
 * 「アップロード〜投稿確定〜詳細表示」が実ブラウザで一往復すること、および
 * 投稿後に Storage 上のファイルへ GPS が実際に残っていないことの確認
 *   docs/architecture/data-model/tables.md post_images
 *   lib/storage/exif-gps-check.ts（WebP対応のGPS再検証。かつてはWebPを認識できず
 *   常に例外→catchで握りつぶされ一度も発火しないdead codeだった）
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

async function waitForUploadedImage(page: Page, index: number) {
  const image = page.getByAltText(`選択した写真 ${index}枚目`)
  await expect(image).toHaveAttribute('src', /^blob:/, { timeout: 15_000 })
  return image
}

/** useComposer が mount 直後に ?draft= をURLへ付け足し、login() の厳密一致アサーションと
 * 競合するため、ログインは '/' で済ませてから遷移する */
async function loginAndOpenComposer(page: Page, user: E2EUser) {
  await login(page, user)
  await page.goto('/new/short')
}

test('GPS付きJPEGを投稿すると、アップロード後のファイルにGPSが残っていない', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'gps.jpg',
    mimeType: 'image/jpeg',
    buffer: await buildRealGpsJpeg(page),
  })
  await waitForUploadedImage(page, 1)

  const submitButton = page.getByRole('button', { name: '投稿する' })
  await expect(submitButton).toBeEnabled()
  await submitButton.click()

  await expect(page).toHaveURL(/\/new\/success/)
  await page.getByRole('link', { name: '投稿を見る' }).click()
  await expect(page).toHaveURL(/\/posts\//)

  // 詳細画面にアップロードした写真が表示される
  await expect(page.getByRole('region', { name: '写真1枚' })).toBeVisible()
  const detailImageSrc = await page.locator('figure img').first().getAttribute('src')
  expect(detailImageSrc).toMatch(/post-images/)

  const postId = new URL(page.url()).pathname.split('/').pop()
  const service = serviceRoleClient()
  const { data: images, error } = await service
    .from('post_images')
    .select('storage_path')
    .eq('post_id', postId as string)
  if (error || !images) throw new Error(`post_images の取得に失敗: ${error?.message}`)
  expect(images).toHaveLength(1)

  const download = await service.storage
    .from(POST_IMAGE_BUCKET)
    .download(images[0].storage_path as string)
  if (download.error || !download.data)
    throw new Error(`アップロード済みファイルの取得に失敗: ${download.error?.message}`)

  const detection = await detectGpsExif(await download.data.arrayBuffer())
  expect(detection).toEqual({ ok: true, data: false })
})

test('複数枚の選択・削除・再選択ができる', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-multi`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  const plain = await buildRealPlainJpeg(page)
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: plain },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: plain },
  ])
  await waitForUploadedImage(page, 1)
  await waitForUploadedImage(page, 2)

  await page.getByRole('button', { name: '1枚目の写真を削除' }).click()
  await expect(page.getByAltText('選択した写真 1枚目')).toHaveCount(1)

  await fileInput.setInputFiles({ name: 'c.jpg', mimeType: 'image/jpeg', buffer: plain })
  await waitForUploadedImage(page, 2)
  await expect(page.getByAltText(/選択した写真/)).toHaveCount(2)
})

test('下書きに保存して離脱すると、リロード後も画像付きで復元される', async ({ page }) => {
  const suffix = uniqueSuffix(`${test.info().project.name}-draft`)
  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  await loginAndOpenComposer(page, user)

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'draft.jpg',
    mimeType: 'image/jpeg',
    buffer: await buildRealPlainJpeg(page),
  })
  await waitForUploadedImage(page, 1)
  await page.getByLabel('コメント').fill('E2E下書きの本文')

  const draftKey = draftKeyFromUrl(page)

  await page.getByRole('button', { name: 'キャンセル' }).click()
  await page.getByRole('button', { name: '下書きに保存して離脱' }).click()
  await expect(page).toHaveURL('/')

  await page.goto(`/new/short?draft=${draftKey}`)
  await expect(page.getByLabel('コメント')).toHaveValue('E2E下書きの本文')
  // 復元後のプレビューは公開URL（blob: ではない）から組み立て直される
  await expect(page.getByAltText('選択した写真 1枚目')).toHaveAttribute('src', /post-images/, {
    timeout: 15_000,
  })
})
