/** `?tag=a&tag=b` のように同じキーが複数来たときは最初の1つだけ使う */
export function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
