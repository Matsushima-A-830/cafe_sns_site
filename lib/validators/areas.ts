import { z } from 'zod'

// S_ONBOARD_AREA。「現在地から検索」用の座標
export const nearestAreaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export type NearestAreaInput = z.infer<typeof nearestAreaSchema>
