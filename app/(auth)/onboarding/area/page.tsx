// S_ONBOARD_AREA: ホームエリア選択
// 詳細: docs/design/wireframes/auth.md#s_onboard_areaホームエリア選択
//
// NOTE: 「現在地から検索」は未実装（areas.center_location が未収集で ST_Distance 比較ができないため。
// pending-items A3）。エリア一覧からの選択のみを提供する
import { createClient } from '@/lib/supabase/server'
import { AreaForm } from './area-form'

export default async function OnboardAreaPage() {
  const supabase = await createClient()
  const { data: areas } = await supabase
    .from('areas')
    .select('code, label')
    .eq('level', 'ward')
    .order('priority', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">よく行くエリアはどこですか？</h1>
        <p className="text-muted-foreground">おすすめの投稿に活用します</p>
      </div>
      <AreaForm areas={areas ?? []} />
    </div>
  )
}
