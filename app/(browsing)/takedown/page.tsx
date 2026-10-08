// ワイヤー外・法務要件で追加（37画面の設計外、docs/product/mvp-scope.md#法務・運用上の対応事項）
// S_REPORT_FORM（ログインユーザーの通報）とは別物。第三者（著作権者等）からの削除請求を受ける窓口（D67）
import type { Metadata } from 'next'
import { RICH_TEXT_CLASS } from '@/components/features/posts/rich-text'

export const metadata: Metadata = {
  title: '削除依頼',
}

export default function TakedownPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold text-foreground">削除依頼</h1>
      <p className="mt-2 text-sm text-muted-foreground">最終更新日: 2026年10月8日</p>

      <div className={RICH_TEXT_CLASS}>
        <p>
          本サービスに掲載されている投稿・画像・コメント等について、著作権・肖像権・プライバシーその他の権利を侵害している、またはその他の理由で削除を希望される場合は、以下の連絡先までご連絡ください。
        </p>

        <h2>連絡先</h2>
        <p>matsu120a40@gmail.com</p>

        <h2>記載いただきたい内容</h2>
        <ul>
          <li>削除を希望する投稿・画像・コメントのURLまたは特定できる情報</li>
          <li>削除を希望する理由（侵害される権利の内容等）</li>
          <li>連絡先（返信用のメールアドレス）</li>
        </ul>

        <p>内容を確認のうえ、対応いたします。</p>
      </div>
    </div>
  )
}
