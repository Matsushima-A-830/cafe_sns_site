// S_HOME / S_MY_HOME — 未ログイン/ログイン後兼用ホーム
// 詳細: docs/design/wireframes/browsing.md / docs/architecture/routing.md
export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold text-foreground mb-4">気分で見つかる、行きつけと繋がる</h1>
      <p className="text-base text-muted-foreground mb-8">カフェ好きのためのSNS — MVP初期化完了</p>
      <div className="rounded-lg border border-border-default bg-surface p-6">
        <p className="text-foreground">実装スタート地点。次: 気分入り口セクションから着手。</p>
      </div>
    </div>
  )
}
