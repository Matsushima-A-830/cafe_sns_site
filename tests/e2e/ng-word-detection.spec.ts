import { expect, test } from '@playwright/test'
import { serviceRoleClient } from '../helpers/supabase'
import { cleanup, createOnboardedUser, uniqueSuffix } from './helpers/data'
import { login } from './helpers/login'

/**
 * NGワード自動検出（S_POST_SHORT）。テスト専用の block ワードを都度作って踏む
 * （seed の恒久ワードに依存すると、辞書の内容変更でテストが理由不明のまま壊れる）。
 * check_ng_words() が admin限定RLSをバイパスできていないと常に「該当なし」になり、
 * 画面上は投稿が成功してしまう
 *   supabase/migrations/20260921040000_create_ng_words.sql
 */

const createdUserIds: string[] = []
const createdNgWordIds: string[] = []

test.afterAll(async () => {
  const service = serviceRoleClient()
  if (createdNgWordIds.length > 0) {
    await service.from('ng_words').delete().in('id', createdNgWordIds)
  }
  await cleanup({ userIds: createdUserIds })
  createdUserIds.length = 0
  createdNgWordIds.length = 0
})

test('block該当のNGワードを含む投稿は拒否され、修正すれば投稿できる', async ({ page }) => {
  const suffix = uniqueSuffix(test.info().project.name)

  const service = serviceRoleClient()
  const ngWord = `e2eブロック語${suffix}`
  const { data, error } = await service
    .from('ng_words')
    .insert({ word: ngWord, severity: 'block' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`E2E NGワードの作成に失敗: ${error?.message}`)
  createdNgWordIds.push((data as { id: string }).id)

  const user = await createOnboardedUser(suffix)
  createdUserIds.push(user.userId)

  // login() は next の完全一致を待つが、composer は下書きIDをクエリに付けて
  // /new/short?draft=... へ遷移するため、ログイン後に別途 goto する
  await login(page, user)
  await page.goto('/new/short')

  const body = page.getByLabel('コメント')
  const submit = page.getByRole('button', { name: '投稿する' })

  await body.fill(`テスト本文${ngWord}です`)
  await submit.click()

  await expect(page.getByText('この内容は投稿できません。表現を見直してください')).toBeVisible()
  // NGワード検出時は投稿ページに留まる（画面遷移しない）
  await expect(page).toHaveURL(/\/new\/short\?draft=/)

  await body.fill('今日のカフェはとても良かったです')
  await submit.click()

  await expect(page).toHaveURL(/\/new\/success/)
})
