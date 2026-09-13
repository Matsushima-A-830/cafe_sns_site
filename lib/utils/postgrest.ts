/**
 * PostgREST の `or=(...)` フィルタにユーザー入力を埋めるためのエスケープ。
 *
 * `or` の中身は「カンマ区切り・括弧構文の文字列」としてサーバーで再パースされる。
 * 素の入力を入れると `,` や `)` で条件を継ぎ足せてしまうため、値は必ず二重引用符で
 * 囲み、引用符とバックスラッシュを退避する。加えて LIKE のワイルドカード（`%` `_`）は
 * 検索語の一部として扱いたいのでリテラル化する（PostgREST 既定のエスケープ文字は `\`）
 */
export function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`)
}

/** `or=(...)` に渡す1つの値。呼び出し側は `name.ilike.${quoteOrFilterValue(pattern)}` の形で使う */
export function quoteOrFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (match) => `\\${match}`)}"`
}
