// 運営向けの一回限りの運用ツール。design docs上の画面ID（S_*）は割り当てない
// （既存カフェの座標バックフィル。pending-items D63）
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { countCafesMissingLocation } from '@/app/_actions/admin-cafe-locations'
import { CafeLocationBackfill } from '@/components/features/admin/cafe-location-backfill'

export const metadata: Metadata = { title: 'カフェ座標バックフィル' }

export default async function AdminCafeLocationsPage() {
  const result = await countCafesMissingLocation()
  if (!result.ok) {
    // middleware が role='admin' 以外を /not-found へ rewrite 済みなので、ここに来て
    // FORBIDDEN/UNAUTHENTICATED になるのは想定外（JWTが更新前など）。詳細を隠さず404にする
    //   app/(admin)/admin/ng-words/page.tsx と同じ方針
    notFound()
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">カフェ座標バックフィル</h1>
        <p className="text-sm text-muted-foreground">
          座標未設定のカフェにGeocoding
          APIで座標を付与します。住所からの特定に失敗した対象はスキップされます。
        </p>
      </header>

      <CafeLocationBackfill initialCount={result.data.count} />
    </div>
  )
}
