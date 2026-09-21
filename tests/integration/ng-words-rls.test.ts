import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

const RLS_VIOLATION = '42501'

const service = serviceRoleClient()

let alice: AuthedUser
let admin: AuthedUser
let blockWordId: string

beforeAll(async () => {
  alice = await createAuthedProfile({ username: 'alice_ng_words' })
  admin = await createAuthedProfile({ username: 'admin_ng_words', role: 'admin' })

  const { data } = await service
    .from('ng_words')
    .insert({ word: 'テストNGワード', severity: 'block', category: 'other' })
    .select('id')
    .single()
  blockWordId = (data as { id: string }).id
})

afterAll(async () => {
  await service.from('ng_words').delete().eq('id', blockWordId)
  await alice?.cleanup()
  await admin?.cleanup()
})

describe('ng_words の RLS', () => {
  it('admin は SELECT できる', async () => {
    const { data, error } = await admin.client.from('ng_words').select('id').eq('id', blockWordId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('一般ユーザーは SELECT できない（0件、エラーにはならない）', async () => {
    const { data, error } = await alice.client.from('ng_words').select('id').eq('id', blockWordId)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('admin は INSERT できる', async () => {
    const { data, error } = await admin.client
      .from('ng_words')
      .insert({ word: 'admin_insert_test', severity: 'warn' })
      .select('id')
      .single()

    expect(error).toBeNull()
    await service
      .from('ng_words')
      .delete()
      .eq('id', (data as { id: string }).id)
  })

  it('一般ユーザーは INSERT できない', async () => {
    const { error } = await alice.client.from('ng_words').insert({ word: 'alice_insert_test' })

    expect(error?.code).toBe(RLS_VIOLATION)
  })

  it('一般ユーザーは DELETE できない', async () => {
    const { error, count } = await alice.client
      .from('ng_words')
      .delete({ count: 'exact' })
      .eq('id', blockWordId)

    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it('admin は UPDATE できる', async () => {
    const { data, error } = await admin.client
      .from('ng_words')
      .update({ severity: 'warn' })
      .eq('id', blockWordId)
      .select('severity')
      .single()

    expect(error).toBeNull()
    expect(data?.severity).toBe('warn')

    // 他のテストが block 前提で書かれているため元に戻す
    await service.from('ng_words').update({ severity: 'block' }).eq('id', blockWordId)
  })

  it('一般ユーザーは UPDATE できない', async () => {
    const { error, count } = await alice.client
      .from('ng_words')
      .update({ severity: 'warn' }, { count: 'exact' })
      .eq('id', blockWordId)

    expect(error).toBeNull()
    expect(count).toBe(0)
  })

  it('word は大文字小文字を無視して一意（citext）', async () => {
    // blockWordId の word 'テストNGワード' と大文字小文字だけ違う値
    const { error } = await admin.client.from('ng_words').insert({ word: 'テストngワード' })

    expect(error?.code).toBe('23505')
  })
})

describe('check_ng_words()', () => {
  it('block該当ワードを含む文で一致した word を返す', async () => {
    const { data, error } = await alice.client.rpc('check_ng_words', {
      p_text: 'これはテストNGワードを含む本文です',
    })

    expect(error).toBeNull()
    expect(data).toBe('テストNGワード')
  })

  it('大文字小文字を無視して一致する', async () => {
    await service.from('ng_words').insert({ word: 'NgCase', severity: 'block' })

    const { data, error } = await alice.client.rpc('check_ng_words', {
      p_text: 'これは ngcase を含む本文です',
    })

    expect(error).toBeNull()
    expect(data).toBe('NgCase')
    await service.from('ng_words').delete().eq('word', 'NgCase')
  })

  it('一致しなければ null を返す', async () => {
    const { data, error } = await alice.client.rpc('check_ng_words', {
      p_text: '普通の投稿本文です',
    })

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('severity=warn のワードは検出対象外（block扱いされない）', async () => {
    await service.from('ng_words').insert({ word: 'ワーン専用ワード', severity: 'warn' })

    const { data, error } = await alice.client.rpc('check_ng_words', {
      p_text: 'これはワーン専用ワードを含む本文です',
    })

    expect(error).toBeNull()
    expect(data).toBeNull()
    await service.from('ng_words').delete().eq('word', 'ワーン専用ワード')
  })

  it('未認証（anon）からは呼べない（投稿・コメントは認証必須のため execute を authenticated のみに絞っている）', async () => {
    const { error } = await anonClient().rpc('check_ng_words', { p_text: 'テストNGワード' })

    expect(error?.code).toBe(RLS_VIOLATION)
  })
})
