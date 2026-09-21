import { z } from 'zod'
import { OWNER_DOCUMENT_TYPES } from '@/lib/constants/owner'

/**
 * オーナー認証申請（S_OWNER_CLAIM）の入力。user_id はセッションから引くのでここには載せない
 *   docs/architecture/data-model/tables.md #cafe_owner_verifications
 */

// z.enum はリテラルのタプルを要求するため、OWNER_DOCUMENT_TYPES（UIの選択肢と単一の情報源）
// から値だけを取り出す。ここで別に書き並べると、選択肢を追加したときにズレたまま気づけない
const documentTypeValues = OWNER_DOCUMENT_TYPES.map((option) => option.value) as [
  (typeof OWNER_DOCUMENT_TYPES)[number]['value'],
  ...(typeof OWNER_DOCUMENT_TYPES)[number]['value'][],
]

export const ownerDocumentTypeSchema = z.enum(documentTypeValues)

export const ownerDocumentSchema = z.object({
  type: ownerDocumentTypeSchema,
  path: z.string().min(1),
})

export const claimCafeSchema = z.object({
  cafeId: z.string().uuid(),
  // 書類2点以上（error-catalog.md DOCUMENTS_INSUFFICIENT）。DB側にも同じ制約があるが、
  // ユーザーへは送信前にフォーム側で気づかせたいのでここでも検証する
  documents: z.array(ownerDocumentSchema).min(2),
  contactEmail: z.string().trim().toLowerCase().email(),
  applicantNote: z.string().trim().max(1000).optional(),
})

export type ClaimCafeInput = z.infer<typeof claimCafeSchema>

export const withdrawClaimSchema = z.object({
  verificationId: z.string().uuid(),
})

export type WithdrawClaimInput = z.infer<typeof withdrawClaimSchema>
