import { describe, expect, it } from 'vitest'
import { haversineDistanceMeters } from './geo-distance'

describe('haversineDistanceMeters', () => {
  it('同じ地点なら0を返す', () => {
    const point = { lat: 35.659, lng: 139.702 }
    expect(haversineDistanceMeters(point, point)).toBe(0)
  })

  it('渋谷駅〜表参道駅間（実距離1.2km前後）を概ね正しく計算する', () => {
    const shibuya = { lat: 35.658034, lng: 139.701636 }
    const omotesando = { lat: 35.665253, lng: 139.712209 }
    const distance = haversineDistanceMeters(shibuya, omotesando)
    expect(distance).toBeGreaterThan(1000)
    expect(distance).toBeLessThan(1400)
  })
})
