import { describe, expect, it } from 'vitest'
import { updateSettingsSchema } from './settings'

describe('updateSettingsSchema', () => {
  it('1項目だけの更新を受け付ける', () => {
    expect(updateSettingsSchema.safeParse({ notifyLike: false }).success).toBe(true)
  })

  it('複数項目の更新を受け付ける', () => {
    const parsed = updateSettingsSchema.safeParse({ useLocation: false, fontScale: 'large' })
    expect(parsed.success).toBe(true)
  })

  it('空オブジェクトは弾く（更新項目が無い）', () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(false)
  })

  it('fontScale は small/normal/large 以外を弾く', () => {
    expect(updateSettingsSchema.safeParse({ fontScale: 'huge' }).success).toBe(false)
  })

  it('notifyEmail は受け付けない（MVPでは未使用の列 B7）', () => {
    const parsed = updateSettingsSchema.safeParse({ notifyEmail: false })
    // 未知キーは無視される。値の有無ではなく既知キーの有無で判定するため空オブジェクト扱いになり弾かれる
    expect(parsed.success).toBe(false)
  })
})
