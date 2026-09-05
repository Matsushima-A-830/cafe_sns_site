# 未決事項・後続検討タスク

MVP計画中に発生した「後で決める」項目を集約。実装フェーズに入る前・入りながら順次解消する。

## 🔴 実装着手時点で未了のもの（2026-09-05 現在）

初回マイグレーション（拡張・共通関数・マスタ3テーブル・seed）は **2026-09-05 に完了**。
残る未了は以下2件で、いずれも次のフェーズで当たる。

| # | 内容 | いつ効いてくるか | ブロックするもの |
|---|---|---|---|
| [A3](#a3-エリア定義制覇マップ用-部分解消設計は確定--座標データが未収集) | `areas.center_location` の座標45件が未収集 | `S_MAP` / カフェ登録の実装時 | 地図表示、エリア自動判定、現在地検索。**seed は座標なしで投入してよい** |
| [A9](#a9-最初の-admin-アカウントをどう作るか--未決2026-09-05-追加) | 最初の admin を作る手段が無い（RLS で role 変更は admin のみ） | `profiles` を作る時 / 管理画面の実装時 | 管理画面すべて（MVPスコープ内）。**初回マイグレーションは踏まずに済ませた**（マスタ3テーブルは書き込み全拒否） |

これ以外の優先度A項目はすべて解消済み。

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

### A3. エリア定義（制覇マップ用）🟡 部分解消（設計は確定 / 座標データが未収集）

- **確定済み:** コード体系・階層・初期セット45件は [seed/areas-initial-set.md](../seed/areas-initial-set.md) で確定
  - コード体系: ISO 3166-2 準拠（`JP-13-shibuya-ku`）
  - マスタテーブル: `areas` を新設、`parent_code` で階層化
  - 初期セット: 東京45エリア（23区 + 主要副地域22）
- **境界ポリゴン (`bounds`) は持たない（2026-09-05 決定）:** [tables.md areas](../architecture/data-model/tables.md#areas) は `center_location`（点）のみを持つ。エリア判定は最寄り中心点への距離で足り、行政界ポリゴンの調達・保守コストに見合わない。地図の初期表示範囲も中心点 + 固定ズームで代替する

#### 🔴 未了: `areas.center_location` の座標データ（2026-09-05 に再確認）

**`areas-initial-set.md` は `code / slug / label / parent_code` しか持っておらず、45件ぶんの緯度経度がどこにもない。**

- **マイグレーションと seed は書ける** — 列は nullable なので `center_location = NULL` で投入できる。初回マイグレーションのブロッカーではない
- **座標が入るまで動かない機能:**
  - `S_MAP` のエリア指定表示（地図の中心が決まらない）
  - 新規カフェ登録時の `area_code` 自動判定（`ST_Distance` の比較対象が無い）
  - `S_ONBOARD_AREA` の「現在地から検索」（最寄りエリアを出せない）
- **必要な作業:** 45件ぶんの中心点（各区役所 or 主要駅の座標）を収集して seed に入れる
- **調達方法の候補:**
  - a) 国土地理院や e-Stat の公開データから区役所座標を取る
  - b) Google Geocoding API に区名・駅名を投げて一括取得（`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` と同じプロジェクトで従量課金）
  - c) 45件を手作業で調べる（1〜2時間程度）
- **決定期限:** `S_MAP` またはカフェ登録機能の実装前。**それまでは seed に座標なしで投入してよい**

### A9. 最初の admin アカウントをどう作るか 🔴 未決（2026-09-05 追加）

- **課題:** `profiles.role` の変更は RLS で **admin のみ**に制限されている（[tables.md profiles](../architecture/data-model/tables.md#profiles)）。この状態では**誰も最初の admin になれない**（鶏と卵）
- **影響:** `S_ADMIN_REPORTS` / `S_ADMIN_REVIEW` / `S_ADMIN_OWNER_REVIEW` / NGワード管理 は MVP スコープ内なので、これが決まらないと管理機能を一切触れない
- **選択肢:**
  - a) `seed.sql` で開発用の admin を1件作る（ローカル・Preview 専用。本番の seed には含めない）
  - b) 本番は service_role キーで一度だけ手動 UPDATE する運用にし、手順を `deployment.md` に残す
  - c) 「最初の1人は admin」になる初回起動時トリガーを置く
- **推奨:** a + b（ローカルは seed で自動、本番は手順化した手動昇格。c は本番で事故ると危険）
- **決定期限:** 管理画面の実装前、または admin がマスタを編集する必要が出た時

#### 初回マイグレーション時点での回避（2026-09-05）

初回マイグレーションはこの決定を踏まずに済ませた。**マスタ3テーブル（`areas` / `tags` / `badges`）には
SELECT ポリシーしか置いていない。** ポリシー不在 = `anon` / `authenticated` からの書き込みは全拒否になるため、
「admin のみ書き込み可」の**安全側の部分実装**として成立している。seed は RLS をバイパスする
service_role で流すので影響しない。

- **効いていないこと:** admin がマスタ（エリア追加・タグの厳選昇格など）を画面から編集できない
- **解消のタイミング:** `profiles` を作る PR で `is_admin()` を定義し、3テーブルに書き込みポリシーを追加する。
  それまでマスタの変更は seed の更新 + `db:reset`、本番は service_role からの手動投入で回す
- **検証:** 拒否パスは `tests/integration/master-tables-rls.test.ts` が押さえている（許可パスの検証は admin が要るのでこの決定待ち）

#### A9 を解く時に同時に片付けること

1. **`db push --include-seed` が admin の編集を毎デプロイ巻き戻す。**
   `seed.sql` の `on conflict do update` は `label` / `priority` / `is_curated` / `description` / `criteria` を
   上書きする（保護しているのは `areas.is_active` のみ）。今は admin がマスタを書けないので無害だが、
   書き込みポリシーを足した瞬間、管理画面での編集が次のデプロイで消える。
   seed を「初期投入のみ（`do nothing`）」に倒すか、マスタ編集を seed 経由に一本化するかを決める
2. **`areas` の2ノード循環を塞ぐ。** `sub_area` 同士が互いを親に指すケースは CHECK では防げないので、
   「親は必ず `level='ward'`」をトリガーで担保する（[tables.md #areas](../architecture/data-model/tables.md#areas)）

### A4. 混雑度データの入力方法 ✅ 解消済（2026-09-03）

- **解消:** ユーザー投稿 + 時間帯別平均グラフ方式に決定
- **DB:** `cafe_congestion_reports`（既存）+ Postgres関数 `get_cafe_congestion_current()` で3段階表示
  1. 直近30分以内のレポートがあれば「今の混雑度」
  2. なければ「同曜日同時間帯の過去4週間平均」
  3. データなしなら「情報なし」CTA
- **UI:** `S_CAFE_DETAIL` に時間帯別ヒートマップも常時表示
- **将来 (C系):** Google Places API "popular times" 連携は投稿数が集まってから検討
- **残作業:** Postgres関数の実装、投稿数増加時に Materialized View 化検討

### A5. 画像ストレージの正をどちらにするか ✅ 解消済（2026-09-05）

- **決定:** **MVP は Supabase Storage に一本化。本格展開の段階で S3 + CloudFront へ移行する。**
- **理由:** 署名付きURL発行・IAM・CORS・バケットポリシーの実装を MVP から外せる。権限は Storage のポリシーで RLS と同じ考え方のまま書ける。オーナー審査書類も同じ仕組みに乗るため、2系統の並行運用を避けられる
- **バケット構成・パス規約・権限:** [data-model/README.md #ストレージ設計](../architecture/data-model/README.md#ストレージ設計)
- **移行に備える設計:** 読み書きはすべて `lib/storage/` のラッパー経由。Server Actions やコンポーネントから Storage クライアントを直接呼ばない
- **残作業 / 監視:**
  - Free の Storage は **1GB**（1枚1MBなら約1000枚）。公開後は月1回ダッシュボードで容量確認
  - アップロード時の WebP 変換・リサイズを初期から入れる（容量が寿命に直結するため）
  - S3 移行の判断は容量が 1GB に近づいた時点

### A6. `pg_cron` が Supabase Free で使えない問題 ✅ 解消済（2026-09-05）

- **決定:** **Supabase Edge Function を GitHub Actions の `schedule` から叩く（a）+ 参照時にも除外する（b）の併用。** Supabase Pro への昇格（c）は採らない
- **理由:** Free 枠のまま動き、スケジューラが遅延・停止しても機能が壊れない
- **対象ジョブと保険:** [deployment.md #定期実行ジョブ](../operations/deployment.md#定期実行ジョブpg_cron-の代替--決定-2026-09-05)
  - 期限切れ下書きの削除 → 下書き一覧の取得時に `expires_at > now()` を必ず付ける
  - オーナー分析の Materialized View 更新 → 画面に最終更新時刻を出す
- **注意:** GitHub Actions の `schedule` は混雑時に遅延・スキップされ、**60日間リポジトリ活動が無いと停止**する。上記の「保険」は必須
- **影響範囲:** 下書き削除だけでなく `S_OWNER_ANALYTICS` の MV 日次更新（[wireframes/owner.md](../design/wireframes/owner.md#s_owner_analytics投稿分析)）も含む。MVPスコープ内
- **残作業:** Edge Function とワークフローの実体を DB 実装フェーズで追加

### A7. オンボーディングで選んだ「好きな気分」の保存先 ✅ 解消済（2026-09-05）

- **決定:** **`user_interest_tags (user_id, tag_id, created_at)` を新設**（[tables.md](../architecture/data-model/tables.md#user_interest_tags)）
- **理由:** 「同じ気分の人が保存したカフェ」（[positioning.md 幹A 施策3](./positioning.md)）はタグ単位の結合と集計が要る。`profiles.metadata` の jsonb では索引が効かず、この一番効かせたいクエリが重くなる
- **上限:** UI と同じ1〜5個を BEFORE INSERT トリガーで担保。選べるのは `tags.category IN ('occasion','mood')` のみ
- **残作業:** オンボーディング後に選び直す画面は MVP では持たない。`S_PROFILE_EDIT` への追加は後続で検討

### A8. 設定画面（`S_SETTINGS`）の保存先 ✅ 解消済（2026-09-05）

- **課題:** `S_SETTINGS` に永続化が必要な項目が8つ（位置情報 / おすすめ活用 / プッシュ / メール / いいね / コメント / フォロー / 文字サイズ）あり、`/settings/privacy` `/settings/notifications` `/settings/display` のルートもあるのに、列もテーブルも存在しなかった
- **決定:** **`user_settings` を型付きの1:1テーブルとして新設**（[tables.md](../architecture/data-model/tables.md#user_settings)）。`profiles.metadata` の jsonb には持たせない
- **理由:** 通知トリガーが SQL から直接この値を読む。jsonb だと毎回キャストとキー欠落の考慮が必要で、型と DEFAULT で守れない
- **通知トグルの効かせ方:** 通知行を**作ってから隠すのではなく、作る前に判定する**（未読カウントがずれるため）
- **プッシュ通知は MVP から外す** → 下記 B7

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

### B6. 電話番号（SMS OTP）でのサインアップ 🟡 MVP見送り決定（2026-09-05）

- **決定:** MVP の登録手段は **メールアドレスのみ**。ドキュメント（[mvp-scope.md](./mvp-scope.md) / [screen-flow.md](../design/screen-flow.md) / [wireframes/auth.md](../design/wireframes/auth.md)）から電話番号の導線を削除済み
- **理由:** Supabase Auth の Phone Auth は SMS 送信を外部プロバイダ（Twilio / MessageBird / Vonage 等）に委譲する仕様で、**無料枠がなく従量課金**（日本向けSMSは1通あたり十数円規模）。[deployment.md](../operations/deployment.md) のフェーズ1コスト見積り（Vercel Hobby + Supabase Free = $0）と両立しない
- **副作用:** `PHONE_ALREADY_EXISTS` は [error-catalog](../architecture/error-catalog.md) と `types/errors.ts` に**残す**（削除しても再追加コストのほうが高い。[D2](#d2-notificationstype--mention-の要否再確認) と同じ判断）
- **再検討の条件:** 収益化して SMS 費用を吸収できる目処が立った時、またはメール到達率が実測で問題になった時
- **決定期限:** 再検討タイミングは PMF 後

### B7. プッシュ通知（Web Push） 🟡 MVP見送り決定（2026-09-05）

- **決定:** `S_SETTINGS` の「プッシュ通知」トグルを **MVP のワイヤーフレームから削除**した。通知はアプリ内通知（`notifications` テーブル）のみ
- **理由:** Web Push は Service Worker + VAPID 鍵 + 購読情報テーブル + 送信基盤が一式必要で、トグル1個で済む規模ではない。[mvp-scope.md](./mvp-scope.md) の MVP 機能表にも元から含まれていない
- **メール通知も同様に MVP では実装しない。** `user_settings.notify_email` の列だけ先に置き、既定 true のまま未使用とする
- **再検討:** PWA 化（[C2](#c2-アプリ化の技術選定)）と合わせて判断するのが自然
- **決定期限:** PWA 化の検討時

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

### D1. Supabase 必須拡張の有効化 ✅ 解消済（2026-09-05）

- **決定:** 有効化するのは **`pgcrypto` / `citext` / `postgis` / `pg_trgm` の4つ**。初回マイグレーションの先頭で `CREATE EXTENSION IF NOT EXISTS ...` する
- **`pgroonga` は導入しない** — 全文検索は `simple` tsvector + `pg_trgm` の2本立てに確定（[tables.md #全文検索の方式](../architecture/data-model/tables.md#全文検索の方式決定-2026-09-05)）。素の PostgreSQL に `'japanese'` 設定は無いため、`to_tsvector('japanese', ...)` は使えない
- **`pg_cron` も使わない** — Supabase Pro 以上のため（[A6](#a6-pg_cron-が-supabase-free-で使えない問題--解消済2026-09-05)）
- 一覧と用途は [deployment.md](../operations/deployment.md#supabase-cloudbackend) 参照

### D2. `notifications.type = 'mention'` の要否再確認

- **課題:** `architecture/data-model/tables.md` で `'mention'` を許容しているが、MVPワイヤーフレームに @メンション入力機能がない
- **対応方針:** MVP実装時に @メンション機能を含めない場合、enumから外す or 残して将来解禁を待つ
- **判断:** 残しても実装コスト増えない。放置可

### D3. Storage オブジェクトのオーファン掃除方針

- **対象:**（保存先は Supabase Storage に確定 → [A5](#a5-画像ストレージの正をどちらにするか--解消済2026-09-05)）
  - `post_images.storage_path`（投稿削除・退会時）
  - `drafts.payload` 内の image_paths（下書き期限切れ時）
  - `cafe_owner_verifications.document_urls` の書類（審査完了・却下後の保管期限）
  - `cafes.main_image_path`（差し替え時の旧ファイル）
  - `profiles.avatar_url`（アバター変更時の旧ファイル）
- **対応案:**
  - a) DB トリガーで削除キューに積み、[A6 のスケジューラ](#a6-pg_cron-が-supabase-free-で使えない問題--解消済2026-09-05)がまとめて Storage から消す
  - b) 日次バッチで参照されていないオブジェクトを走査して削除
  - c) DB削除時に Server Actions から明示的に Storage delete を呼ぶ
- **決定期限:** ストレージ量が実運用で膨らむ前。**Free 枠が 1GB しかないため、A5 の想定より早く効いてくる可能性がある**

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
- **推奨（2026-09-05）: `(browsing)` のまま進める。** 一般的な `(public)` は「未ログインでも見える」を含意するが、`(browsing)` 配下には `/cafes/new`（要ログイン）が入っており、名前と権限が一致しない。どの名前でも誤解は残るので、既に37画面のドキュメント全体で使われている現行名を変えないほうが安い

### D9. `badges.criteria` の JSON が全20件ぶん書かれていない ✅ 解消済（2026-09-05）

- **決定:** 20件ぶんの `criteria` を確定し [`supabase/seed.sql`](../../supabase/seed.sql) に投入した。type 一覧と各フィールドは [seed/badges-initial-set.md #badgescriteria-の構造確定-2026-09-05](../seed/badges-initial-set.md) を正とする
- **type は9種:** `post_count` / `distinct_area_count` / `post_count_with_tag` / `post_count_with_tags_or` / `distinct_scene_tag_count` / `regular_customer_count` / `follower_count` / `likes_received` / `likes_given`。`threshold` は全 type 共通の必須項目
- **`scope` はオブジェクト形に確定:** `{"level":"ward"}` / `{"level":"ward","prefecture_code":"JP-13"}`。`level` を明示しないと、副地域投稿で `area_visits` に親の区も入る仕様（[README.md #エリアコードの一貫性](../architecture/data-model/README.md#エリアコードの一貫性)）のせいで1投稿でエリア数が2増える
- **DB側のガード:** `badges_criteria_shape_check` が `type`(string) と `threshold`(number) の存在を守る。type の値そのものは列挙しない（フェーズ2でバッジ種別が増えるたびにマイグレーションを打つのは割に合わない）
- **残作業:** `lib/badges/rules.ts` で9つの type それぞれの判定を実装する（バッジ機能の実装時）

### D6. `/new/success` を独立ルートにする必要性

- **課題:** 投稿完了画面 `S_POST_SUCCESS` を専用ルートにしたが、URL直踏みで意味を持たない（コンテキスト不足）
- **代替案:**
  - `/posts/[id]` にリダイレクト + 成功トーストと軽アニメーション
  - Server Actions の `redirect()` で `/posts/[id]?just_posted=true` を返し、ページ側でフラグ検出しアニメーション表示
- **決定期限:** 投稿機能実装時

### D7. GitHub リポジトリの main ブランチ保護

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

### D8. Biome バージョン Bump 時の手順

- **課題:** Dependabot が Biome を bump した PR は `biome.json` の `$schema` が古いバージョンURLのため lint 失敗する
- **対応手順（Bump 時に必ず実施）:**
  1. `biome.json` の `$schema` を新バージョン URL に更新
  2. `pnpm exec biome migrate --write` で設定移行
  3. `pnpm biome check --write` で再フォーマット
- **自動化候補:** Dependabot 用 GitHub Actions workflow で PR 更新後に自動 biome migrate を実行
- **決定期限:** Biome bump が頻繁に来るようになった時

## 削除・アーカイブ判断待ち

現時点で「削除する」と決めた項目はなし。追加・変更発生時にここに追記。
