// S_MAP: 地図ビュー
// docs/design/wireframes/browsing.md #S_MAP
// docs/architecture/routing.md: SSR（Client Component主体）
import { HomeSideNav } from '@/components/features/feed/home-side-nav'
import { getNearbyCafes } from '@/lib/cafes/nearby'
import { createClient } from '@/lib/supabase/server'
import { MapView } from './map-view'

// 現在地が取れない・拒否された場合のフォールバック中心（新宿駅）
export const DEFAULT_MAP_CENTER = { lat: 35.6896, lng: 139.7006 }

export default async function MapPage() {
  const supabase = await createClient()

  const [{ data: areas }, { data: tags }, initialCafes, { data: userData }] = await Promise.all([
    supabase
      .from('areas')
      .select('code, label')
      .eq('level', 'ward')
      .order('priority', { ascending: false }),
    // 雰囲気・利用機会の絞り込み用（D63）。カフェに直接タグは付かず post_tags 経由で
    // 投稿に付くだけなので、選択肢は tags マスタから取り、絞り込み自体は nearby_cafes 側で行う
    supabase
      .from('tags')
      .select('slug, label, category')
      .eq('is_curated', true)
      .in('category', ['mood', 'occasion'])
      .order('priority', { ascending: false })
      .order('slug'),
    getNearbyCafes(supabase, DEFAULT_MAP_CENTER),
    supabase.auth.getUser(),
  ])

  const moodTags = (tags ?? []).filter((tag) => tag.category === 'mood')
  const occasionTags = (tags ?? []).filter((tag) => tag.category === 'occasion')

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8">
      <HomeSideNav current="map" isAuthed={userData.user !== null} />

      <div className="min-w-0 flex-1">
        <h1 className="sr-only">地図</h1>
        <MapView
          areas={areas ?? []}
          moodTags={moodTags}
          occasionTags={occasionTags}
          initialCafes={initialCafes}
          defaultCenter={DEFAULT_MAP_CENTER}
          isAuthenticated={userData.user !== null}
        />
      </div>
    </div>
  )
}
