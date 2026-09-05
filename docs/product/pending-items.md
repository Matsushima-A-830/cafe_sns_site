# 未決事項・後続検討タスク

MVP計画中に発生した「後で決める」項目を集約。実装フェーズに入る前・入りながら順次解消する。

## 優先度A: MVPリリース前に決める必要あり

### A1. Safari対応方針 🟡 部分決定（2026-09-03）

**現状:** MVP開発期間中は **明示的に非対応**、リリース前に再判断。

- **開発中の必須ルール:** CSS/JSは Safari互換を意識して書く（`-webkit-` プレフィックス、`100vh` iOS挙動、date input差異、`backdrop-filter` 等）
- **Playwrightで WebKit エンジン** も並行してテスト実行
- **MVPリリース前:** BrowserStack Live を1ヶ月契約 ($29) して主要画面を集中検証
- **未決:** リリース後に継続契約するか、中古Mac miniに切り替えるかは MVP実績を見て判断
- 参照: memory `project-safari-pending`

### A2. 厳選タグ初期セット30個の具体化 ✅ 解消済（2026-09-03）

- **解消:** [seed/curated-tags-initial-set.md](../seed/curated-tags-initial-set.md) にて確定
- **配分:** occasion 15 / mood 10 / other 5（差別化戦略 幹A を反映してシーン最重視）
- **priority 導入:** `tags.priority` で表示順を制御（occasion=100 / mood=50 / other=10）
- **残作業:** DB初期化時に seed SQL を実行

### A3. エリア定義（制覇マップ用）✅ 解消済（2026-09-03）

- **解消:** [seed/areas-initial-set.md](../seed/areas-initial-set.md) にて確定
- **コード体系:** ISO 3166-2 準拠（`JP-13-shibuya-ku`）
- **マスタテーブル:** `areas` を新設、`parent_code` で階層化
- **初期セット:** 東京45エリア（23区 + 主要副地域22）
- **残作業:**
  - DB初期化時に `areas` テーブル作成 + seed SQL 実行
  - エリア境界 (`center_location`, `bounds`) の座標データ収集
  - 新規カフェ登録時の `area_code` 自動判定ロジック（PostGIS `ST_Distance`）

### A4. 混雑度データの入力方法 ✅ 解消済（2026-09-03）

- **解消:** ユーザー投稿 + 時間帯別平均グラフ方式に決定
- **DB:** `cafe_congestion_reports`（既存）+ Postgres関数 `get_cafe_congestion_current()` で3段階表示
  1. 直近30分以内のレポートがあれば「今の混雑度」
  2. なければ「同曜日同時間帯の過去4週間平均」
  3. データなしなら「情報なし」CTA
- **UI:** `S_CAFE_DETAIL` に時間帯別ヒートマップも常時表示
- **将来 (C系):** Google Places API "popular times" 連携は投稿数が集まってから検討
- **残作業:** Postgres関数の実装、投稿数増加時に Materialized View 化検討

### A5. 画像ストレージの正をどちらにするか 🔴 未決

- **課題:** ドキュメント間で S3 と Supabase Storage が混在している
  - `CLAUDE.md` 技術スタック / `tables.md` `post_images.storage_path` → **AWS S3 + CloudFront**
  - `tables.md` `cafe_owner_verifications.document_urls` / `owner.md` → **Supabase Storage 非公開バケット**
  - `deployment.md` の Local 例 → 「未設定で Supabase Storage を使用」
- **選択肢:**
  - a) 公開画像は S3 + CloudFront、非公開の審査書類のみ Supabase Storage（現状のドキュメント通り、2系統を運用）
  - b) MVP は Supabase Storage に一本化し、帯域が問題になった時点で S3 + CloudFront へ移行
- **推奨:** b（MVPの運用コストと実装工数が小さい。`lib/storage/` のラッパー越しに使い、移行時の差し替え点を1箇所に閉じる）
- **決定期限:** 投稿画像アップロード機能の実装前

### A6. `pg_cron` が Supabase Free で使えない問題 🔴 未決

- **課題:** `drafts.expires_at`（30日）の自動削除に `pg_cron` を想定しているが、**`pg_cron` は Supabase Pro 以上**。`deployment.md` のコスト見積りは Free 前提で $0
- **影響範囲:** 期限切れ下書きの削除、将来の集計バッチ（`cafe_congestion_hourly_avg` の Materialized View 更新等）
- **選択肢:**
  - a) Supabase Edge Function + 外部スケジューラ（GitHub Actions の `schedule`）で日次実行
  - b) 参照時に遅延削除（下書き一覧の取得時に `expires_at < now()` を除外 + まとめて削除）
  - c) Supabase Pro ($25/月) に上げる
- **推奨:** a + b の併用（Free 枠のまま動き、取りこぼしがない）
- **決定期限:** 下書き自動保存の実装前

## 優先度B: 実装フェーズ中に解消可

### B1. バッジ画像アセット

- **必要枚数:** 20バッジ × 3階層（未取得/取得済/獲得エフェクト） = 約60枚
- **調達方法の選択肢:**
  - a) デザイナーへ外注
  - b) AI生成（Midjourney、DALL-E等）
  - c) アイコンライブラリ + 色バリエーション
- **推奨:** b + c のハイブリッド（コスト重視）
- **決定期限:** バッジUI実装前

### B2. Googleビジネスプロフィール連携（オーナー認証）

- **課題:** OAuth相当のフロー実装が技術的に可能か未検証。
- **必要作業:**
  - Google My Business API のドキュメント確認
  - 個人開発者でも利用可能なAPIか審査要件確認
  - 認証済み判定のペイロード確認
- **代替案:** 検証結果NG時は書類提出のみに絞る
- **決定期限:** オーナー認証機能実装前

### B3. 保護者同意メールのテンプレート・送信基盤

- **課題:** 未成年アカウント有効化フローに必須。
- **必要作業:**
  - メール文面（保護者向け説明・同意ボタン・拒否リンク）
  - Supabase の内蔵メール送信で足りるか、外部サービス（Resend, SendGrid）併用か判断
  - 同意リンククリック時のワンタイムトークン設計
- **決定期限:** サインアップ実装前

### B4. NGワード辞書の初期セット

- **課題:** `ng_words` テーブルに投入する初期辞書が未定。
- **選択肢:**
  - a) OSSの日本語NGワードリストを利用（例: TokyoJapanese/Japanese-ng-words）
  - b) 独自にキュレーション
  - c) 外部AIモデレーション（Perspective API）に移行
- **推奨:** MVPは a、成長後に c を検討
- **決定期限:** 投稿機能実装前

### B5. `cafe_special_hours` テーブルの要否

- **課題:** オーナー限定投稿の `closure`（臨時休業・営業時間変更）で期間を入力させるが、現状は `posts.metadata` に持つだけで `cafe_business_hours` に反映されない。`S_OWNER_CAFE_EDIT` にも「特別営業日 [追加]」UIがある
- **選択肢:**
  - a) `cafe_special_hours (cafe_id, date, opens_at, closes_at, is_closed, source_post_id)` を新設し、カフェ詳細の営業時間表示で当日分を上書き
  - b) MVP は告知（公式投稿）のみに留め、営業時間表示は通常の `cafe_business_hours` のまま
- **推奨:** MVP は b、公式投稿の利用が定着したら a へ
- **決定期限:** オーナー限定投稿 `closure` の実装前
- 参照: [wireframes/composer.md](../design/wireframes/composer.md) / [wireframes/owner.md](../design/wireframes/owner.md)

## 優先度C: MVP後で可

### C1. 本番AWSアーキテクチャ詳細

- **候補構成:**
  - Amplify Hosting（Next.js SSR対応）
  - ECS Fargate + ALB
  - Lambda + API Gateway
- **決定基準:** MVPのトラフィック実績、コスト、運用工数
- **決定期限:** PMF確認後

### C2. アプリ化の技術選定

- 選択肢: React Native (Expo) / Capacitor / PWA
- **決定期限:** Web版で一定の利用者を獲得後

### C3. 収益化フラグの実装

- テーブルには `is_promoted`, `owner_verified` 等の余地あり
- 具体的な広告・PR枠のUI/UX設計はフェーズ2以降

### C4. フェーズ2で採用予定の行動経済学要素

- 社会的証明表示（「今週◯人が保存」等）
- 希少性表示（「今月あと3席」等）
- アンカリング（価格比較）
- 対応時にDBカラム追加が必要かどうか事前確認

### C5. 幹B「コミュニティ・オフライン連動」機能（PMF後に検討）

差別化戦略 [positioning.md](./positioning.md) の幹Bとして保留:

- 趣味グループ（「朝活カフェ部」「読書カフェ部」等）
- オフラインイベント機能（カフェ巡り会）
- 「似た好みの人」マッチング
- チェックイン機能（「今このカフェにいます」）
- グループチャット / DM機能（DMは差別化戦略上、慎重に判断）

**判断基準:** MVP でのユーザー数が一定規模を超えたら幹B を検討。

### C6. 幹C 拡張機能（実装は幹C初期実装後）

- 予約・席取り連携（外部システム or 独自）
- オーナーから常連へのお知らせ機能（クーポン等）
- 常連ランク（訪問頻度による銅/銀/金）
- カフェ来店履歴の記録（オプトイン、プライバシー配慮）

## 優先度D: 実装時に判断する軽微な項目

ドキュメント整合性レビュー（2026-09-01）で検出した軽微な懸念。実装時に対応する。

### D1. Supabase 必須拡張の有効化

- **対象拡張:** `citext`（大文字小文字無視のusername）/ `pgcrypto`（`gen_random_uuid`）/ `PostGIS`（`geography` 型）/ `pg_trgm`（`gin_trgm_ops` インデックス）/ 場合により `pgroonga`（日本語全文検索）
- **対応タイミング:** DB初期化スクリプトに `CREATE EXTENSION IF NOT EXISTS ...` を含める
- **注意:** Supabaseの管理画面 or migration SQLで有効化

### D2. `notifications.type = 'mention'` の要否再確認

- **課題:** `architecture/data-model/tables.md` で `'mention'` を許容しているが、MVPワイヤーフレームに @メンション入力機能がない
- **対応方針:** MVP実装時に @メンション機能を含めない場合、enumから外す or 残して将来解禁を待つ
- **判断:** 残しても実装コスト増えない。放置可

### D3. Storage オブジェクトのオーファン掃除方針

- **対象:**
  - `post_images.storage_path` に紐づく S3 オブジェクト（投稿削除・退会時）
  - `drafts.payload` 内の image_paths に紐づくオブジェクト（下書き期限切れ時）
  - `cafe_owner_verifications.document_urls` の書類（審査完了・却下後の保管期限）
  - `profiles.avatar_url`（アバター変更時の旧ファイル）
- **対応案:**
  - a) Supabase Storage の `on delete cascade` 相当を DB トリガーで実現
  - b) 日次バッチで参照されていない S3 オブジェクトを削除
  - c) DB削除時に Server Actions 経由で明示的に S3 delete を呼ぶ
- **決定期限:** ストレージ量が実運用で膨らむ前

### D4. `post_tags` の5個上限のDB制約

- **課題:** UIで「タグ最大5個」を謳っているが、`post_tags` テーブルに `CHECK` 制約や BEFORE INSERT トリガーがない
- **対応案:**
  - a) BEFORE INSERT トリガーで `COUNT(*) < 5` をチェック
  - b) アプリ層バリデーションのみ（現状想定）
- **推奨:** a を実装。悪意ある直接API呼び出しへの保護

### D5. Route Group 名 `browsing` の命名見直し

- **課題:** Next.js コミュニティでは `(marketing)` / `(public)` / `(guest)` が一般的
- **影響:** 動作には影響なし。将来の共同開発時の学習コスト
- **対応判断:** 実装開始時に決定。変更しないままでも問題なし

### D6b. GitHub リポジトリの main ブランチ保護

- **課題:** GitHub Free では private リポの branch protection / rulesets が使えない (HTTP 403)
- **現状の代替:**
  - ローカル: `lefthook` の pre-push で typecheck + test を強制
  - CI: `.github/workflows/ci.yml` で lint/typecheck/test/build を PR + main で実行
  - この二重チェックで実質的な保護を担保
- **対応案:**
  - a) GitHub Pro に加入 ($4/月) して protection/rulesets を有効化
  - b) リポジトリを Public 化して protection を無料で有効化
  - c) 現状維持（個人開発の自己規律で補完）
- **決定期限:** チームメンバーが増える時、または PMF 後

### D6c. Biome バージョン Bump 時の手順

- **課題:** Dependabot が Biome を bump した PR は `biome.json` の `$schema` が古いバージョンURLのため lint 失敗する
- **対応手順（Bump 時に必ず実施）:**
  1. `biome.json` の `$schema` を新バージョン URL に更新
  2. `pnpm exec biome migrate --write` で設定移行
  3. `pnpm biome check --write` で再フォーマット
- **自動化候補:** Dependabot 用 GitHub Actions workflow で PR 更新後に自動 biome migrate を実行
- **決定期限:** Biome bump が頻繁に来るようになった時

### D6. `/new/success` を独立ルートにする必要性

- **課題:** 投稿完了画面 `S_POST_SUCCESS` を専用ルートにしたが、URL直踏みで意味を持たない（コンテキスト不足）
- **代替案:**
  - `/posts/[id]` にリダイレクト + 成功トーストと軽アニメーション
  - Server Actions の `redirect()` で `/posts/[id]?just_posted=true` を返し、ページ側でフラグ検出しアニメーション表示
- **決定期限:** 投稿機能実装時

## 削除・アーカイブ判断待ち

現時点で「削除する」と決めた項目はなし。追加・変更発生時にここに追記。
