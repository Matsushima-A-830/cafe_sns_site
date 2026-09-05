import { describe, expect, it } from 'vitest'
import { splitPathAndQuery } from './split-path-query'

describe('splitPathAndQuery', () => {
  it('クエリ無しならそのままpathnameになる', () => {
    expect(splitPathAndQuery('/login')).toEqual({ pathname: '/login', search: '' })
  })

  it('クエリ文字列を分離する（? や % を pathname に混ぜない）', () => {
    expect(splitPathAndQuery('/login?next=%2Fme')).toEqual({
      pathname: '/login',
      search: 'next=%2Fme',
    })
  })

  it('? が複数あっても最初の1つで分割する', () => {
    expect(splitPathAndQuery('/search?q=a?b')).toEqual({ pathname: '/search', search: 'q=a?b' })
  })
})
