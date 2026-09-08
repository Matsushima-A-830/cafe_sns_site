import { NextResponse } from 'next/server'
import {
  type CreateUploadUrlError,
  createPostImageUploadUrl,
  type PostImageUploadTarget,
} from '@/lib/storage/post-images'
import { createClient } from '@/lib/supabase/server'
import { uploadSignSchema } from '@/lib/validators/uploads'
import type { Result } from '@/types/result'

/**
 * Result型は常に200 OKで返す規約（docs/architecture/error-catalog.md）。
 * HTTPステータスでの成否判定はせず、body の ok/error で判定する
 *   docs/architecture/routing.md POST /api/uploads/sign
 */
export async function POST(
  request: Request,
): Promise<NextResponse<Result<PostImageUploadTarget, CreateUploadUrlError | 'INVALID_INPUT'>>> {
  const body: unknown = await request.json().catch(() => null)
  const parsed = uploadSignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() })
  }

  const supabase = await createClient()
  const result = await createPostImageUploadUrl(supabase, parsed.data)
  return NextResponse.json(result)
}
