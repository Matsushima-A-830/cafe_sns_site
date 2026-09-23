import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/types/database'
import { checkAndAwardBadges } from './check'

// 呼び出し元（createPost/likePost/followUser/awardRegular）はバッジ判定の成否に
// 左右されてはいけない。badges の読み取りが例外を投げても、checkAndAwardBadges
// 自体は reject せず静かに終わることを保証する
describe('checkAndAwardBadges', () => {
  it('badges 読み取りが例外を投げても呼び出し元に伝播しない', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stub = {
      from: vi.fn(() => ({
        select: vi.fn().mockRejectedValue(new Error('network error')),
      })),
    }
    const supabase = stub as unknown as SupabaseClient<Database>

    await expect(checkAndAwardBadges(supabase, 'user-1', 'POST_CREATED')).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
