import { afterAll, describe, expect, it } from 'vitest'
import { serviceRoleClient } from '../helpers/supabase'

// CHECK 制約違反で PostgREST が返す SQLSTATE
const CHECK_VIOLATION = '23514'

const service = serviceRoleClient()

// 制約が壊れて INSERT が通ってしまった場合に、後続ファイルの件数テストを
// 巻き込まないよう痕跡を消す
afterAll(async () => {
  await service.from('badges').delete().like('code', 'CONSTRAINT_TEST_%')
  await service.from('areas').delete().like('code', 'JP-13-constraint-test%')
  await service.from('tags').delete().like('slug', 'constraint-test-%')
})

describe('badges.criteria の形状制約', () => {
  const insertCriteria = (code: string, criteria: unknown) =>
    service.from('badges').insert({ code, name: '制約テスト', criteria })

  it('type と threshold が揃っていれば通る', async () => {
    const { error } = await insertCriteria('CONSTRAINT_TEST_OK', {
      type: 'post_count',
      threshold: 1,
    })

    expect(error).toBeNull()
  })

  // jsonb_typeof は STRICT なのでキー欠落だと NULL を返す。
  // CHECK は NULL でも通過するため、coalesce で潰さないと素通りする。
  //
  // code は日本語ラベルから作らず ASCII で明示する。ラベルから生成すると
  // 全ケースが同じ code に潰れ、制約が退行した時に2件目以降が 23514 ではなく
  // 23505（unique 違反）で落ちて誤診につながる
  it.each([
    ['EMPTY', '空オブジェクト', {}],
    ['TYPE_ONLY', 'type だけ', { type: 'post_count' }],
    ['THRESHOLD_ONLY', 'threshold だけ', { threshold: 1 }],
    ['TYPE_NOT_STRING', 'type が文字列でない', { type: 5, threshold: 1 }],
    ['THRESHOLD_NOT_NUMBER', 'threshold が数値でない', { type: 'post_count', threshold: '1' }],
    ['ARRAY', 'オブジェクトですらない（配列）', []],
    ['SCALAR', 'オブジェクトですらない（文字列）', 'post_count'],
  ])('%s: %s は拒否される', async (key, _label, criteria) => {
    const { error } = await insertCriteria(`CONSTRAINT_TEST_${key}`, criteria)

    expect(error?.code).toBe(CHECK_VIOLATION)
  })
})

describe('areas の制約', () => {
  it('code が prefecture_code + slug と一致しないと拒否される', async () => {
    const { error } = await service.from('areas').insert({
      code: 'JP-13-constraint-test-mismatch',
      prefecture_code: 'JP-13',
      slug: 'something-else',
      label: '不一致',
      level: 'ward',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('未知の level は拒否される', async () => {
    const { error } = await service.from('areas').insert({
      code: 'JP-13-constraint-test-level',
      prefecture_code: 'JP-13',
      slug: 'constraint-test-level',
      label: '未知レベル',
      level: 'prefecture',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('ward は親を持てない（階層は1段のみ）', async () => {
    const { error } = await service.from('areas').insert({
      code: 'JP-13-constraint-test-ward-parent',
      prefecture_code: 'JP-13',
      slug: 'constraint-test-ward-parent',
      label: '親を持つ区',
      level: 'ward',
      parent_code: 'JP-13-shibuya-ku',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('自分自身を親にはできない', async () => {
    const { error } = await service.from('areas').insert({
      code: 'JP-13-constraint-test-self',
      prefecture_code: 'JP-13',
      slug: 'constraint-test-self',
      label: '自己参照',
      level: 'sub_area',
      parent_code: 'JP-13-constraint-test-self',
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })
})

describe('tags の制約', () => {
  it('未知の category は拒否される', async () => {
    const { error } = await service
      .from('tags')
      .insert({ slug: 'constraint-test-category', label: '未知', category: 'season' })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })

  it('usage_count は負にできない', async () => {
    const { error } = await service.from('tags').insert({
      slug: 'constraint-test-usage',
      label: '負のカウント',
      category: 'mood',
      usage_count: -1,
    })

    expect(error?.code).toBe(CHECK_VIOLATION)
  })
})
