import { describe, expect, it } from 'vitest'
import { toOfficialMetadata } from './official-metadata'

describe('toOfficialMetadata', () => {
  it('official_format が null なら null を返す', () => {
    expect(toOfficialMetadata(null, { menu_name: 'マロンタルト' })).toBeNull()
  })

  it('未知の official_format は null を返す', () => {
    expect(toOfficialMetadata('unknown_format', {})).toBeNull()
  })

  it('today_special: menu_name があれば priceYen/validUntil の欠落を null で補って返す', () => {
    expect(toOfficialMetadata('today_special', { menu_name: 'マロンタルト' })).toEqual({
      format: 'today_special',
      menuName: 'マロンタルト',
      priceYen: null,
      validUntil: null,
    })
  })

  it('today_special: menu_name が欠けている（壊れた行）と null を返す', () => {
    expect(toOfficialMetadata('today_special', { price_yen: 580 })).toBeNull()
  })

  it('today_special: 型の一致しない price_yen は無視して null 扱いにする', () => {
    expect(
      toOfficialMetadata('today_special', { menu_name: 'マロンタルト', price_yen: '580' }),
    ).toEqual({
      format: 'today_special',
      menuName: 'マロンタルト',
      priceYen: null,
      validUntil: null,
    })
  })

  it('new_menu: menu_name と available_from が両方揃って初めて値を返す', () => {
    expect(toOfficialMetadata('new_menu', { menu_name: '秋ブレンド' })).toBeNull()
    expect(
      toOfficialMetadata('new_menu', {
        menu_name: '秋ブレンド',
        price_yen: 620,
        available_from: '2026-09-22',
      }),
    ).toEqual({
      format: 'new_menu',
      menuName: '秋ブレンド',
      priceYen: 620,
      availableFrom: '2026-09-22',
    })
  })

  it('closure: closure_type が想定外の値なら closed にフォールバックする', () => {
    expect(
      toOfficialMetadata('closure', {
        closure_type: 'something_else',
        starts_on: '2026-09-25',
        ends_on: '2026-09-26',
      }),
    ).toEqual({
      format: 'closure',
      closureType: 'closed',
      startsOn: '2026-09-25',
      endsOn: '2026-09-26',
      reason: '',
    })
  })

  it('closure: starts_on / ends_on が欠けていると null を返す', () => {
    expect(toOfficialMetadata('closure', { closure_type: 'closed' })).toBeNull()
  })

  it('tip: 追加項目が無くても format だけ返す', () => {
    expect(toOfficialMetadata('tip', {})).toEqual({ format: 'tip' })
  })

  it('metadata がオブジェクトでなくても例外を投げず null 扱いで処理する', () => {
    expect(toOfficialMetadata('today_special', null)).toBeNull()
    expect(toOfficialMetadata('tip', 'not-an-object')).toEqual({ format: 'tip' })
  })
})
