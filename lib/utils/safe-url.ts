/**
 * 表示に使ってよい URL か。`javascript:` や `data:` を弾く。
 *
 * 本文JSON（posts.body_json）も profiles.avatar_url も、composer / オンボーディングを
 * 通らず API 直叩きで書き込まれ得る。入力側の検証を信用せず、描画の直前で必ず確認する
 */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^https?:\/\//i.test(value) ? value : null
}
