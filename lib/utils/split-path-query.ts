/**
 * "/login?next=%2Fme" のような文字列をパス部分とクエリ文字列部分に分ける。
 * NextResponse の url.pathname に "?" を含む文字列をそのまま代入すると "?" や "%" まで
 * パーセントエンコードされてしまうため、middleware の redirect ヘルパーはこれを経由する
 */
export function splitPathAndQuery(to: string): { pathname: string; search: string } {
  const questionMarkIndex = to.indexOf('?')
  if (questionMarkIndex === -1) return { pathname: to, search: '' }
  return { pathname: to.slice(0, questionMarkIndex), search: to.slice(questionMarkIndex + 1) }
}
