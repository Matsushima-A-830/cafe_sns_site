import { z } from 'zod'

// 検索語は ilike のパターンに埋めるだけで、長さに意味は無い。
// 極端に長い入力でDBを無駄に叩かないための上限
export const searchCafesSchema = z.object({
  query: z.string().trim().max(50).optional(),
})

export const cafeIdSchema = z.object({
  cafeId: z.string().uuid('カフェIDの形式が正しくありません'),
})

export type SearchCafesInput = z.infer<typeof searchCafesSchema>

// S_MAP。閲覧者の現在地（またはフォールバック座標）と絞り込み条件
export const nearbyCafesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  areaCode: z.string().min(1).optional(),
  query: z.string().trim().max(50).optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

export type NearbyCafesInput = z.infer<typeof nearbyCafesSchema>

// S_CAFE_NEW（カフェ新規登録）。main_image_path は含めない
// （cafe-images バケット未作成のため v1 スコープ外。docs/product/pending-items.md D31）。
// location（lat/lng）は Google Places Autocomplete 経由でのみ受け取る（新規登録時のみ。
// 既存カフェのバックフィルはスコープ外）
export const createCafeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'カフェ名を入力してください')
    .max(100, 'カフェ名は100文字以内で入力してください'),
  nameKana: z.string().trim().max(100, 'カナは100文字以内で入力してください').optional(),
  prefecture: z
    .string()
    .trim()
    .min(1, '都道府県を入力してください')
    .max(20, '都道府県は20文字以内で入力してください'),
  city: z
    .string()
    .trim()
    .min(1, '市区町村を入力してください')
    .max(50, '市区町村は50文字以内で入力してください'),
  areaCode: z.string().min(1).optional(),
  address: z.string().trim().max(200, '住所は200文字以内で入力してください').optional(),
  phone: z.string().trim().max(20, '電話番号は20文字以内で入力してください').optional(),
  website: z.string().trim().url('URLの形式が正しくありません').optional().or(z.literal('')),
  description: z.string().trim().max(500, '説明は500文字以内で入力してください').optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
})

export type CreateCafeInput = z.infer<typeof createCafeSchema>

// lat/lng は両方指定するか両方省略する。片方だけの入力はフォームの取りこぼしを疑う
export const cafeLocationBothOrNeither = (data: { lat?: number; lng?: number }) =>
  (data.lat === undefined) === (data.lng === undefined)

export const createCafeInputSchema = createCafeSchema.refine(cafeLocationBothOrNeither, {
  message: '緯度経度は両方指定してください',
  path: ['lat'],
})

// S_OWNER_CAFE_EDIT。createCafeSchema に cafeId・externalIds を足したもの。
// main_image_path は含めない（cafe-images バケット未作成のため今回もスコープ外。
//   docs/product/pending-items.md D31）。location は新規登録時のみ収集する運用のため、
// 編集フォームでは扱わない（lat/lng を明示的に除く）
export const externalIdsSchema = z.object({
  googlePlaceId: z.string().trim().max(200, 'Place IDは200文字以内で入力してください').optional(),
  tabelogUrl: z.string().trim().url('URLの形式が正しくありません').optional().or(z.literal('')),
})

export const updateCafeSchema = createCafeSchema.omit({ lat: true, lng: true }).extend({
  cafeId: z.string().uuid('カフェIDの形式が正しくありません'),
  externalIds: externalIdsSchema.optional(),
})

export type UpdateCafeInput = z.infer<typeof updateCafeSchema>

// S_OWNER_CAFE_EDIT の営業時間編集。cafe_business_hours の1曜日ぶん。
// opensAt/closesAt は disabled な <input type="time"> が値なしで送るとき undefined ではなく
// 空文字になる（ネイティブ input の仕様）ため、website と同じく `.or(z.literal(''))` で許容する
const timeFieldSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません')
  .optional()
  .or(z.literal(''))

export const businessHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    isClosed: z.boolean(),
    opensAt: timeFieldSchema,
    closesAt: timeFieldSchema,
  })
  .refine((hour) => hour.isClosed || (hour.opensAt && hour.closesAt), {
    message: '定休日でない場合は開店・閉店時刻を入力してください',
    path: ['opensAt'],
  })

export const updateCafeBusinessHoursSchema = z.object({
  cafeId: z.string().uuid('カフェIDの形式が正しくありません'),
  hours: z.array(businessHourSchema).length(7, '7曜日ぶんのデータが必要です'),
})

export type UpdateCafeBusinessHoursInput = z.infer<typeof updateCafeBusinessHoursSchema>

// CafeEditForm（S_OWNER_CAFE_EDIT）1画面ぶんのクライアント側バリデーション。
// 基本情報と営業時間は別々の Server Action（updateCafe / updateCafeBusinessHours）に
// 送るが、フォーム自体は1つなので zodResolver 用にまとめる
export const cafeEditFormSchema = updateCafeSchema.extend({
  hours: z.array(businessHourSchema).length(7, '7曜日ぶんのデータが必要です'),
})

export type CafeEditFormValues = z.infer<typeof cafeEditFormSchema>
