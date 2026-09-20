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

// S_CAFE_NEW（カフェ新規登録）。location / main_image_path は含めない
// （Google Maps 未統合・cafe-images バケット未作成のため v1 スコープ外。
//   docs/product/pending-items.md A3 / D31）
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
})

export type CreateCafeInput = z.infer<typeof createCafeSchema>
