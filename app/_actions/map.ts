'use server'

import { getNearbyCafes, type NearbyCafe } from '@/lib/cafes/nearby'
import { createClient } from '@/lib/supabase/server'
import { nearbyCafesSchema } from '@/lib/validators/cafes'
import type { Result } from '@/types/result'

/**
 * S_MAP。閲覧者の現在地（またはフォールバック座標）に応じて、クライアント側から
 * 都度カフェを取り直すための Server Action。認可は nearby_cafes（security invoker）が
 * RLS に委譲する
 */
export async function searchNearbyCafes(
  input: unknown,
): Promise<Result<NearbyCafe[], 'INVALID_INPUT' | 'INTERNAL_ERROR'>> {
  const parsed = nearbyCafesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() }

  try {
    const supabase = await createClient()
    const cafes = await getNearbyCafes(supabase, parsed.data)
    return { ok: true, data: cafes }
  } catch (cause) {
    console.error('[map] 近くのカフェの取得に失敗:', cause)
    return { ok: false, error: 'INTERNAL_ERROR' }
  }
}
