import type { BadgeProgress } from '@/lib/badges/progress'
import { BadgeProgressCard, BadgeTile } from './badge-card'

/**
 * 獲得済み/挑戦中/ロック中の3段階に分けてバッジを表示する。
 * 境界線: current>0 かつ未獲得を「挑戦中」、current=0 を「ロック中」とする
 * （ワイヤーに明記が無いため、進捗が動いているかどうかで区別する解釈を採用）
 */
export function BadgeGrid({ progress }: { progress: BadgeProgress[] }) {
  const earned = progress.filter((badge) => badge.earned)
  const challenging = progress.filter((badge) => !badge.earned && badge.current > 0)
  const locked = progress.filter((badge) => !badge.earned && badge.current === 0)

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">獲得済み ({earned.length})</h2>
        {earned.length === 0 ? (
          <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
            まだ獲得したバッジはありません。投稿や交流でバッジを集めましょう。
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5">
            {earned.map((badge) => (
              <li key={badge.id}>
                <BadgeTile badge={badge} locked={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">挑戦中 ({challenging.length})</h2>
        {challenging.length === 0 ? (
          <p className="rounded-lg border border-border-default bg-surface p-6 text-base text-muted-foreground">
            進行中のバッジはありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {challenging.map((badge) => (
              <li key={badge.id}>
                <BadgeProgressCard badge={badge} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">ロック中 ({locked.length})</h2>
        {locked.length === 0 ? (
          <p className="text-base text-muted-foreground">すべてのバッジが挑戦中か獲得済みです。</p>
        ) : (
          <details className="flex flex-col gap-4" open>
            <summary className="cursor-pointer text-sm text-link underline focus-visible:ring-2 focus-visible:ring-ring-focus focus-visible:outline-none">
              達成条件の表示を切り替え
            </summary>
            <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-5">
              {locked.map((badge) => (
                <li key={badge.id}>
                  <BadgeTile badge={badge} locked />
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  )
}
