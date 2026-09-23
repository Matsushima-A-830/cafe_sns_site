import { z } from 'zod'

// S_OWNER_ANALYTICS の「CSVでダウンロード」。weeks は期間トグル（直近4週間/12週間）の2値のみ
export const exportCafeAnalyticsCsvSchema = z.object({
  cafeId: z.string().uuid('カフェIDの形式が正しくありません'),
  weeks: z.union([z.literal(4), z.literal(12)]),
})

export type ExportCafeAnalyticsCsvInput = z.infer<typeof exportCafeAnalyticsCsvSchema>
