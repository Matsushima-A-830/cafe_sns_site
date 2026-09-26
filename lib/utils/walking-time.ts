/** 徒歩分速80mで概算する。ワイヤーの「徒歩3分」表示用（S_MAP） */
const WALKING_METERS_PER_MINUTE = 80

export function estimateWalkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / WALKING_METERS_PER_MINUTE))
}
