// S_CAFE_NEW: カフェ新規登録
// 詳細: docs/design/screen-flow.md#3-投稿作成フロー（composer の CafePicker から遷移）
//
// NOTE: ワイヤーフレームが存在しない画面（docs/design/wireframes/ に S_CAFE_NEW の記載なし）。
// フォーム項目はハンドオフメモと cafes テーブル定義から設計した。
// location（座標）は Google Places Autocomplete で新規登録時のみ収集する（feat/s-map）。
// main_image_path（画像）は cafe-images バケット未作成のため含めない（docs/product/pending-items.md D31）
import { createClient } from '@/lib/supabase/server'
import { CafeNewForm } from './cafe-new-form'

export default async function CafeNewPage() {
  const supabase = await createClient()
  const { data: areas } = await supabase
    .from('areas')
    .select('code, label')
    .eq('level', 'ward')
    .order('priority', { ascending: false })

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">カフェを登録</h1>
        <p className="text-muted-foreground">
          見つからなかったカフェをここから登録できます。登録後、誰でも見られるようになります。
        </p>
      </div>
      <CafeNewForm areas={areas ?? []} />
    </div>
  )
}
