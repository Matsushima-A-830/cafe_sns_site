import { describe, expect, it } from 'vitest'
import { estimateWalkMinutes } from './walking-time'

describe('estimateWalkMinutes', () => {
  it('分速80mで四捨五入する', () => {
    expect(estimateWalkMinutes(240)).toBe(3)
    expect(estimateWalkMinutes(80)).toBe(1)
  })

  it('1分未満でも最低1分を返す', () => {
    expect(estimateWalkMinutes(0)).toBe(1)
    expect(estimateWalkMinutes(10)).toBe(1)
  })
})
