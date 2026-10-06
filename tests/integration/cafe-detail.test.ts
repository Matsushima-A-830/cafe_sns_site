import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cafeExists, getCafeDetail, getCafePostCount } from '@/lib/cafes/cafe-detail'
import { getCafeCongestion, toCongestionSummary } from '@/lib/cafes/congestion'
import { resolveFeedOptions } from '@/lib/posts/feed'
import { getPostList } from '@/lib/posts/post-list'
import type { FeedQuery } from '@/lib/validators/feed'
import type { Database } from '@/types/database'
import {
  type AuthedUser,
  anonClient,
  createAuthedProfile,
  serviceRoleClient,
} from '../helpers/supabase'

// lib/cafes/* を実 DB に対して動かす。確認したいのは:
//  1. cafes_select_active_* が closed / hidden を落とし、アプリ層で status を書かなくても404相当になること
//  2. cafe_business_hours_select_all が using (true) でも、カフェ本体を先に引けば hidden のものが漏れないこと
//  3. 投稿グリッドに他のカフェの投稿が混ざらないこと
//  4. 混雑度の生の行は読めず、集計だけが get_cafe_congestion_current() 経由で読めること

const service = serviceRoleClient()
const anon = anonClient()

const bodyJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'カフェ詳細のテスト投稿' }] }],
}

const BASE_TIME = Date.parse('2030-03-01T00:00:00.000Z')
const publishedAt = (offsetMinutes: number) =>
  new Date(BASE_TIME + offsetMinutes * 60_000).toISOString()

let author: AuthedUser
let reporter: AuthedUser
let owner: AuthedUser

const cafeIds: string[] = []
const postIds: string[] = []

function typed(client: SupabaseClient): SupabaseClient<Database> {
  return client as unknown as SupabaseClient<Database>
}

async function insertCafe(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await service
    .from('cafes')
    .insert({ name: 'テスト珈琲店', prefecture: '東京都', city: '渋谷区', ...overrides })
    .select('id')
    .single()
  if (error || !data) throw new Error(`テスト用 cafes の作成に失敗: ${error?.message}`)
  cafeIds.push(data.id)
  return data.id
}

async function insertPost(cafeId: string | null, overrides: Record<string, unknown> = {}) {
  const id = crypto.randomUUID()
  const { error } = await service.from('posts').insert({
    id,
    author_id: author.userId,
    cafe_id: cafeId,
    post_type: 'short',
    body_json: bodyJson,
    status: 'published',
    published_at: publishedAt(0),
    ...overrides,
  })
  if (error) throw new Error(`テスト投稿の作成に失敗: ${error.message}`)
  postIds.push(id)
  return id
}

let activeCafeId: string
let closedCafeId: string
let hiddenCafeId: string
let otherCafeId: string

beforeAll(async () => {
  author = await createAuthedProfile({ username: 'author_cafe_detail' })
  reporter = await createAuthedProfile({ username: 'reporter_cafe_detail' })
  owner = await createAuthedProfile({ username: 'owner_cafe_detail' })

  activeCafeId = await insertCafe({
    name: '表参道ロースタリー',
    address: '東京都渋谷区1-1-1',
    phone: '03-0000-0000',
    website: 'https://example.com',
    description: '静かな喫茶店',
  })
  closedCafeId = await insertCafe({
    name: '閉店した店',
    status: 'closed',
    verified_owner_id: owner.userId,
  })
  hiddenCafeId = await insertCafe({
    name: '非公開の店',
    status: 'hidden',
    verified_owner_id: owner.userId,
  })
  otherCafeId = await insertCafe({ name: '別の店' })

  // 平日 08:00-22:00 / 日曜定休 / 金曜は深夜営業。
  // 一括 insert は列を揃えないと、欠けた列に NULL が入って not-null 制約に当たる
  const { error: hoursError } = await service.from('cafe_business_hours').insert([
    { cafe_id: activeCafeId, day_of_week: 0, opens_at: null, closes_at: null, is_closed: true },
    {
      cafe_id: activeCafeId,
      day_of_week: 1,
      opens_at: '08:00',
      closes_at: '22:00',
      is_closed: false,
    },
    {
      cafe_id: activeCafeId,
      day_of_week: 5,
      opens_at: '22:00',
      closes_at: '02:00',
      is_closed: false,
    },
    {
      cafe_id: hiddenCafeId,
      day_of_week: 1,
      opens_at: '10:00',
      closes_at: '18:00',
      is_closed: false,
    },
  ])
  if (hoursError) throw new Error(`テスト用営業時間の作成に失敗: ${hoursError.message}`)

  await insertPost(activeCafeId, { published_at: publishedAt(2) })
  await insertPost(activeCafeId, { published_at: publishedAt(1) })
  await insertPost(otherCafeId, { published_at: publishedAt(3) })
  // 件数にも一覧にも出てはいけない行（予約行の hidden・論理削除済み）
  await insertPost(activeCafeId, { status: 'hidden', published_at: null })
  await insertPost(activeCafeId, { deleted_at: new Date().toISOString() })
})

afterAll(async () => {
  if (postIds.length > 0) await service.from('posts').delete().in('id', postIds)
  if (cafeIds.length > 0) await service.from('cafes').delete().in('id', cafeIds)
  await author?.cleanup()
  await reporter?.cleanup()
  await owner?.cleanup()
})

describe('getCafeDetail', () => {
  it('公開中のカフェを未ログインでも取得できる', async () => {
    const cafe = await getCafeDetail(typed(anon), activeCafeId)

    expect(cafe).toMatchObject({
      id: activeCafeId,
      name: '表参道ロースタリー',
      address: '東京都渋谷区1-1-1',
      phone: '03-0000-0000',
      website: 'https://example.com',
      isVerified: false,
    })
  })

  it('closed / hidden は RLS が落とすので null になる（アプリ層で status を書いていない）', async () => {
    expect(await getCafeDetail(typed(anon), closedCafeId)).toBeNull()
    expect(await getCafeDetail(typed(anon), hiddenCafeId)).toBeNull()
  })

  it('closed / hidden でも本人（verified_owner_id）からは get_owned_cafe_detail 経由で見える（D55）', async () => {
    const closed = await getCafeDetail(typed(owner.client), closedCafeId)
    expect(closed).toMatchObject({ id: closedCafeId, name: '閉店した店' })

    const hidden = await getCafeDetail(typed(owner.client), hiddenCafeId)
    expect(hidden).toMatchObject({ id: hiddenCafeId, name: '非公開の店' })
  })

  it('closed / hidden は本人以外の認証済みユーザーからは見えない（null）のまま', async () => {
    expect(await getCafeDetail(typed(reporter.client), closedCafeId)).toBeNull()
    expect(await getCafeDetail(typed(reporter.client), hiddenCafeId)).toBeNull()
  })

  it('存在しないIDは null', async () => {
    expect(await getCafeDetail(typed(anon), crypto.randomUUID())).toBeNull()
  })

  it('UUID でないIDは DB に投げずに null（PostgREST の 22P02 を起こさない）', async () => {
    expect(await getCafeDetail(typed(anon), 'not-a-uuid')).toBeNull()
  })

  it('営業時間を曜日順で返す。定休日と深夜営業もそのまま持つ', async () => {
    const cafe = await getCafeDetail(typed(anon), activeCafeId)

    expect(cafe?.businessHours.map((hour) => hour.dayOfWeek)).toEqual([0, 1, 5])
    expect(cafe?.businessHours[0]).toMatchObject({ isClosed: true, opensAt: null })
    expect(cafe?.businessHours[1]).toMatchObject({ opensAt: '08:00:00', closesAt: '22:00:00' })
    expect(cafe?.businessHours[2]).toMatchObject({ opensAt: '22:00:00', closesAt: '02:00:00' })
  })

  it('座標未収集のカフェは location が null（pending-items D63 のバックフィル未実施分）', async () => {
    const cafe = await getCafeDetail(typed(anon), activeCafeId)
    expect(cafe?.location).toBeNull()
  })

  it('座標があるカフェは cafe_lat/cafe_lng の computed column から緯度経度を返す', async () => {
    const locatedCafeId = await insertCafe({
      name: '座標ありの店',
      location: 'SRID=4326;POINT(139.702 35.659)',
    })

    const cafe = await getCafeDetail(typed(anon), locatedCafeId)
    expect(cafe?.location).toEqual({ lat: 35.659, lng: 139.702 })
  })

  it('hidden なカフェの営業時間は cafe_business_hours 単体では読めてしまう', async () => {
    // cafe_business_hours_select_all は using (true)。カフェ本体を先に引いて404にすることで
    // 漏れを塞いでいる（営業時間から先に引く実装にすると漏れる）
    const { data } = await anon
      .from('cafe_business_hours')
      .select('cafe_id')
      .eq('cafe_id', hiddenCafeId)

    expect(data?.length).toBe(1)
    expect(await getCafeDetail(typed(anon), hiddenCafeId)).toBeNull()
  })
})

describe('getCafePostCount', () => {
  it('公開中の投稿だけを数える（下書き・論理削除済みを含めない）', async () => {
    expect(await getCafePostCount(typed(anon), activeCafeId)).toBe(2)
  })

  it('投稿が無いカフェは0', async () => {
    const emptyCafeId = await insertCafe({ name: '投稿ゼロの店' })
    expect(await getCafePostCount(typed(anon), emptyCafeId)).toBe(0)
  })
})

describe('投稿グリッド（cafeId 絞り込み）', () => {
  const query = (overrides: Partial<FeedQuery> = {}): FeedQuery => ({
    scope: 'new',
    tagSlug: null,
    areaCode: null,
    authorUsername: null,
    cafeId: null,
    lat: null,
    lng: null,
    ...overrides,
  })

  it('他のカフェの投稿が混ざらない', async () => {
    const page = await getPostList(typed(anon), { cafeId: activeCafeId })

    expect(page.items.length).toBe(2)
    expect(page.items.every((item) => item.cafe?.id === activeCafeId)).toBe(true)
  })

  it('resolveFeedOptions はカフェIDをそのまま絞り込みに載せる', async () => {
    const resolved = await resolveFeedOptions(typed(anon), query({ cafeId: activeCafeId }), null)

    expect(resolved?.options.cafeId).toBe(activeCafeId)
  })

  it('閲覧できないカフェは null を返す（ページ本体の404を「もっと見る」がすり抜けない）', async () => {
    expect(await resolveFeedOptions(typed(anon), query({ cafeId: hiddenCafeId }), null)).toBeNull()
    expect(await resolveFeedOptions(typed(anon), query({ cafeId: closedCafeId }), null)).toBeNull()
    expect(
      await resolveFeedOptions(typed(anon), query({ cafeId: crypto.randomUUID() }), null),
    ).toBeNull()
  })
})

describe('cafeExists', () => {
  it('公開中のカフェだけ true。closed / hidden / 不正なIDは false', async () => {
    expect(await cafeExists(typed(anon), activeCafeId)).toBe(true)
    expect(await cafeExists(typed(anon), closedCafeId)).toBe(false)
    expect(await cafeExists(typed(anon), hiddenCafeId)).toBe(false)
    expect(await cafeExists(typed(anon), 'not-a-uuid')).toBe(false)
  })
})

describe('混雑度', () => {
  it('報告が無ければ none', async () => {
    const summary = await getCafeCongestion(typed(anon), activeCafeId)
    expect(summary).toEqual({ source: 'none', levelAvg: null, sampleCount: 0 })
  })

  it('生の行は他人には読めない（集計だけが公開される）', async () => {
    const { error } = await reporter.client
      .from('cafe_congestion_reports')
      .insert({ cafe_id: activeCafeId, user_id: reporter.userId, level: 4 })
    expect(error).toBeNull()

    // 未ログインでは0件。エラーではなく空で返るのが RLS の見え方
    const { data: anonRows } = await anon
      .from('cafe_congestion_reports')
      .select('id')
      .eq('cafe_id', activeCafeId)
    expect(anonRows ?? []).toEqual([])

    // 本人は自分の行だけ読める
    const { data: ownRows } = await reporter.client
      .from('cafe_congestion_reports')
      .select('id')
      .eq('cafe_id', activeCafeId)
    expect(ownRows?.length).toBe(1)

    const summary = await getCafeCongestion(typed(anon), activeCafeId)
    expect(summary).toEqual({ source: 'recent', levelAvg: 4, sampleCount: 1 })
  })

  it('30分より前の報告は historical になる（p_now を注入して時刻に依存させない）', async () => {
    const cafeId = await insertCafe({ name: '過去データの店' })
    // p_now と同じ「今」を基準に、1時間前（=直近30分の外、同じ時間帯の窓の中）へ置く
    const now = new Date('2030-03-05T12:00:00.000Z')
    const reportedAt = new Date(now.getTime() - 60 * 60_000).toISOString()

    const { error } = await service.from('cafe_congestion_reports').insert([
      { cafe_id: cafeId, user_id: reporter.userId, level: 2, reported_at: reportedAt },
      { cafe_id: cafeId, user_id: author.userId, level: 4, reported_at: reportedAt },
    ])
    expect(error).toBeNull()

    const { data } = await anon.rpc('get_cafe_congestion_current', {
      p_cafe_id: cafeId,
      p_now: now.toISOString(),
    })

    expect(toCongestionSummary(data?.[0])).toEqual({
      source: 'historical',
      levelAvg: 3,
      sampleCount: 2,
    })
  })

  it('level_avg が NULL でも型に頼らずデータなしとして扱える', async () => {
    const cafeId = await insertCafe({ name: '報告ゼロの店' })
    const { data } = await anon.rpc('get_cafe_congestion_current', { p_cafe_id: cafeId })

    // 生成型は level_avg を non-nullable にするが、実際には NULL が返る
    expect(data?.[0]?.level_avg).toBeNull()
    expect(toCongestionSummary(data?.[0]).source).toBe('none')
  })
})
