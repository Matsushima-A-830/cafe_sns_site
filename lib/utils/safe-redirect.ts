/**
 * ?next= のようなクエリ由来のリダイレクト先はオープンリダイレクトの入口になるため、
 * 同一オリジンの相対パスであることを確認してから使う。
 *
 * プレフィックスの文字列チェック（"//" や "/\\" を弾く等）は漏れがある。
 * 例えば "/\\evil.com" は new URL() でブラウザに解決させると "https://evil.com/" になる
 * （バックスラッシュをスラッシュ扱いする挙動があるため）。ダミーの origin を基準に
 * URL として解決させ、その origin が変わっていないかで判定する
 */
export function safeRedirectPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback

  const DUMMY_ORIGIN = 'http://localhost'
  let resolved: URL
  try {
    resolved = new URL(next, DUMMY_ORIGIN)
  } catch {
    return fallback
  }

  if (resolved.origin !== DUMMY_ORIGIN) return fallback
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
