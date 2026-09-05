export type AgeCategory = 'blocked' | 'minor' | 'adult'

/**
 * 13歳未満は blocked、13〜17歳は minor（保護者同意フロー）、18歳以上は adult。
 * DB 側の enforce_min_age トリガーと同じ「13年前の当日」判定をアプリ層でも行う（二重ガード）
 */
export function calculateAgeCategory(birthDate: Date, today: Date = new Date()): AgeCategory {
  const age = calculateAge(birthDate, today)
  if (age < 13) return 'blocked'
  if (age < 18) return 'minor'
  return 'adult'
}

export function calculateAge(birthDate: Date, today: Date = new Date()): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth()
  const beforeBirthdayThisYear =
    monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())
  if (beforeBirthdayThisYear) age -= 1
  return age
}
