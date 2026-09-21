import { z } from 'zod'

/**
 * S_ADMIN_NG_WORDS の追加フォーム入力。severity/category の値域は
 * ng_words の CHECK 制約と一致させる
 *   docs/architecture/data-model/tables.md #ng_words
 */
export const addNgWordSchema = z.object({
  word: z.string().trim().min(1).max(100),
  severity: z.enum(['warn', 'block']),
  category: z.enum(['harassment', 'adult', 'spam', 'other']).optional(),
})

export type AddNgWordInput = z.infer<typeof addNgWordSchema>

export const deleteNgWordSchema = z.object({
  ngWordId: z.string().uuid(),
})

export type DeleteNgWordInput = z.infer<typeof deleteNgWordSchema>
