import { describe, expect, it } from 'vitest'
import { assertLocal } from './supabase'

// このガードが緩むと、SUPABASE_URL を export したまま pnpm test:integration を
// 叩いた瞬間に本番の行が service role で消える。壊れたら気づけるようにしておく
describe('assertLocal', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])(
    'ローカルの %s は通す',
    (url) => {
      expect(() => assertLocal(url)).not.toThrow()
    },
  )

  it.each([
    'https://abcdefgh.supabase.co',
    'https://db.example.com',
    'http://127.0.0.1.evil.example.com',
    // bind 用アドレス。接続先としては意味を持たない
    'http://0.0.0.0:54321',
  ])('ローカル以外の %s は拒否する', (url) => {
    expect(() => assertLocal(url)).toThrow(/ローカル以外への接続を拒否/)
  })

  it('URL として壊れていれば拒否する', () => {
    expect(() => assertLocal('not-a-url')).toThrow(/URL として解釈できない/)
  })
})
