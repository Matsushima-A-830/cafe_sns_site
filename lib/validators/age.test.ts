import { describe, expect, it } from 'vitest'
import { calculateAge, calculateAgeCategory } from './age'

const today = new Date('2026-09-05T00:00:00Z')

describe('calculateAge', () => {
  it('誕生日を迎えていれば年齢を+1する', () => {
    expect(calculateAge(new Date('2010-09-05T00:00:00Z'), today)).toBe(16)
  })

  it('誕生日前なら+1しない', () => {
    expect(calculateAge(new Date('2010-09-06T00:00:00Z'), today)).toBe(15)
  })
})

describe('calculateAgeCategory', () => {
  it('12歳は blocked', () => {
    expect(calculateAgeCategory(new Date('2013-09-06T00:00:00Z'), today)).toBe('blocked')
  })

  it('13歳ちょうどは minor', () => {
    expect(calculateAgeCategory(new Date('2013-09-05T00:00:00Z'), today)).toBe('minor')
  })

  it('17歳は minor', () => {
    expect(calculateAgeCategory(new Date('2009-09-06T00:00:00Z'), today)).toBe('minor')
  })

  it('18歳ちょうどは adult', () => {
    expect(calculateAgeCategory(new Date('2008-09-05T00:00:00Z'), today)).toBe('adult')
  })
})
