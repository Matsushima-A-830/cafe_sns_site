/**
 * ?next= のようなクエリ由来のリダイレクト先はオープンリダイレクトの入口になるため、
 * 同一オリジンの相対パスであることを確認してから使う。
 * "//evil.com" や "https://evil.com" のようなプロトコル相対/絶対URLは拒否する
 */
export function safeRedirectPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}
