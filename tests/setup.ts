import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// lib/env は import 時に Zod で検証するため、未設定だと env を辿る全テストが落ちる。
// ユニットテストは実サーバに繋がないので、形式だけ満たすローカル既定値を入れる
// （.env.local は vitest からは読み込まれない）
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key'
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000'

// jsdom は ResizeObserver を実装しない。Radix の Checkbox 等（useSize フック）が
// マウント時に呼ぶため、使うコンポーネントのテストが軒並み落ちる。実測不要なテストなので no-op で足りる
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

// jsdom は IntersectionObserver も実装しない（無限スクロール系コンポーネント用）。
// テスト側から発火を制御できるよう、生成されたインスタンスを記録しておく
type IntersectionCallback = ConstructorParameters<typeof IntersectionObserver>[0]
export const intersectionObserverInstances: MockIntersectionObserver[] = []

class MockIntersectionObserver {
  callback: IntersectionCallback
  constructor(callback: IntersectionCallback) {
    this.callback = callback
    intersectionObserverInstances.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  /** テストから番兵が交差した状態を模倣する */
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}
globalThis.IntersectionObserver ??=
  MockIntersectionObserver as unknown as typeof IntersectionObserver

// jsdom の window.scrollTo は呼ぶたびに "not implemented" を出すだけのスタブなので、
// スクロール位置復元系コンポーネントのテストが毎回ノイズを吐く。no-op で上書きする
window.scrollTo = (() => {}) as typeof window.scrollTo

afterEach(() => {
  cleanup()
  intersectionObserverInstances.length = 0
})
