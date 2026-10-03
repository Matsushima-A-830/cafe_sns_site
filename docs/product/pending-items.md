# 未決事項・後続検討タスク

MVP計画中に発生した「後で決める」項目を集約。実装フェーズに入る前・入りながら順次解消する。

## 🔴 実装着手時点で未了のもの（2026-09-05 現在）

初回マイグレーション（拡張・共通関数・マスタ3テーブル）と profiles 一式
（profiles / user_settings / user_interest_tags / follows / blocks）は **2026-09-05 に完了**。
座標データ（A3）も **2026-09-26 に解消**。残る優先度A項目は A1（Safari対応方針、意図的にリリース前まで保留）のみ。

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

### A3. エリア定義（制覇マップ用）✅ 解消済（2026-09-26、座標データ投入）

- **確定済み:** コード体系・階層・初期セット45件は [seed/areas-initial-set.md](../seed/areas-initial-set.md) で確定
  - コード体系: ISO 3166-2 準拠（`JP-13-shibuya-ku`）
  - マスタテーブル: `areas` を新設、`parent_code` で階層化
  - 初期セット: 東京45エリア（23区 + 主要副地域22）
- **境界ポリゴン (`bounds`) は持たない（2026-09-05 決定）:** [tables.md areas](../architecture/data-model/tables.md#areas) は `center_location`（点）のみを持つ。エリア判定は最寄り中心点への距離で足り、行政界ポリゴンの調達・保守コストに見合わない。地図の初期表示範囲も中心点 + 固定ズームで代替する
- **解消（2026-09-26）:** `areas.center_location` の座標45件を Google Geocoding API（`"東京都 {label}"` で一括問い合わせ）で
  取得し、`supabase/migrations/20260926214427_backfill_area_coordinates.sql` の UPDATE 文で投入した
  （既存の `20260905120400_seed_master_data.sql` は forward-only 原則により書き換えず、別マイグレーションで埋めた）
- **この解消で動くようになった機能:** `S_MAP` のエリア指定表示（`S_MAP` 本体の実装は別PR、`feat/s-map` で対応）
- **この解消でもまだ動かない機能（別スコープ）:**
  - 新規カフェ登録時の `area_code` 自動判定（`ST_Distance` によるエリア判定ロジック自体は未実装。S_CAFE_NEW はワイヤーフレーム自体が無く、仕様の決め打ちが要るため引き続きスコープ外）
  - `S_ONBOARD_AREA` の「現在地から検索」は **解消済み（2026-09-30、D63）**。`nearest_area` RPC（KNN距離順、`level='ward'`固定）を追加し、位置情報許可→最寄りエリア自動選択まで動く

### A9. 最初の admin アカウントをどう作るか ✅ 解消済（2026-09-05）

- **課題:** `profiles.role` の変更は admin 限定なので、誰も最初の admin になれない（鶏と卵）
- **決定: a + b の併用**
  - **ローカル / Preview:** [`supabase/seed.sql`](../../supabase/seed.sql) が開発用 admin を1件作る
    （`admin@example.test` / `password123`、`id = 00000000-0000-4000-8000-000000000001`）。
    `seed.sql` は `db reset` でしか実行されないので、**本番には絶対に入らない**
  - **本番:** service_role で一度だけ手動 UPDATE する。手順は
    [deployment.md #本番の最初の-admin-を作る](../operations/deployment.md) に記載
- **c（「最初の1人は admin」トリガー）は不採用** — 本番で事故ると危険
- **これを成立させている実装上のポイント:** `profiles` の
  `guard_privileged_profile_columns` トリガーは `auth.uid()` が NULL のとき素通りする。
  service_role と直接接続を巻き込むと本番に admin を作る手段が消えるため
  （検証: `tests/integration/profiles-rls.test.ts` の「service_role は role を昇格できる」）
- **マスタ3テーブルの書き込みポリシー**も `is_admin()` の追加で開いた（20260905130400）

### A4. 混雑度データの入力方法 ✅ 解消済（2026-09-03）

- **解消:** ユーザー投稿 + 時間帯別平均グラフ方式に決定
- **DB:** `cafe_congestion_reports`（既存）+ Postgres関数 `get_cafe_congestion_current()` で3段階表示
  1. 直近30分以内のレポートがあれば「今の混雑度」
  2. なければ「同曜日同時間帯の過去4週間平均」
  3. データなしなら「情報なし」CTA
- **UI:** `S_CAFE_DETAIL` に時間帯別ヒートマップも常時表示
- **将来 (C系):** Google Places API "popular times" 連携は投稿数が集まってから検討
- **残作業:** Postgres関数の実装、投稿数増加時に Materialized View 化検討
- **スパム対策 (2026-09-06決定):** 同一ユーザーによる同一カフェへの連続投稿を制限するレート制限・クールダウンは MVP では入れない。RLS は「INSERT 認証済み」のみ。荒らし・スコア汚染が実際に問題化した時点で BEFORE INSERT トリガーによるクールダウン導入を検討する

### A5. 画像ストレージの正をどちらにするか ✅ 解消済（2026-09-05）

- **決定:** **MVP は Supabase Storage に一本化。本格展開の段階で S3 + CloudFront へ移行する。**
- **理由:** 署名付きURL発行・IAM・CORS・バケットポリシーの実装を MVP から外せる。権限は Storage のポリシーで RLS と同じ考え方のまま書ける。オーナー審査書類も同じ仕組みに乗るため、2系統の並行運用を避けられる
- **バケット構成・パス規約・権限:** [data-model/README.md #ストレージ設計](../architecture/data-model/README.md#ストレージ設計)
- **移行に備える設計:** 読み書きはすべて `lib/storage/` のラッパー経由。Server Actions やコンポーネントから Storage クライアントを直接呼ばない
- **残作業 / 監視:**
  - Free の Storage は **1GB**（1枚1MBなら約1000枚）。公開後は月1回ダッシュボードで容量確認
  - アップロード時の WebP 変換・リサイズを初期から入れる（容量が寿命に直結するため）
  - S3 移行の判断は容量が 1GB に近づいた時点

### A10. EXIF除去がクライアント信頼に依存している ✅ 解消済（2026-09-25）

- **課題:** [`POST /api/uploads/sign`](../architecture/routing.md) は署名付きアップロードURLを発行し、クライアントが
  Storage へ直PUTする構成（[A5](#a5-画像ストレージの正をどちらにするか--解消済2026-09-05)）。サーバはファイルの
  バイト列を一度も見ないため、CLAUDE.md の「画像アップロード時は EXIF を必ず剥がす（位置情報保護）」を**アーキテクチャ上
  強制できない**。改造クライアントや実装バグで GPS付きの画像が公開バケットに直接入り得る
- **リスク:** 10〜20代がメインターゲットで自宅・学校周辺のカフェを投稿する性質上、位置情報漏洩の実害は小さくない
- **選択肢:**
  - a) アップロード後に Route Handler / Edge Function 側で EXIF 検証 → 検出時に該当オブジェクトを削除（一往復増えるが直PUTの構成は維持できる）
  - b) 直PUTをやめてサーバ経由アップロードに変更（帯域・実行時間を消費、A5の決定を覆す）
  - c) 現状維持（クライアント側処理を信頼するリスクを許容）
- **決定:** **a を採用。** `createPost` / `createOfficialPost` の `finalize_*` RPC呼び出し直前で、アップロード済みの
  `post-images` オブジェクトを Storage から読み直し `exifr.gps()` で GPS の有無を確認する（`lib/storage/post-image-verify.ts`
  の `verifyNoGpsExif`）。検出時は該当オブジェクトを `deletePostImages` で削除したうえで投稿自体を `EXIF_STRIP_FAILED` で拒否する
  （finalize 失敗時とは異なり、GPS付き画像は再送しても使い回せない実害物のため）
- **理由:** b は直PUT構成というA5の決定を覆し帯域・実行時間コストも増える。c は🔴未決のまま実害を許容し続けることになる。
  a はクライアント側処理（`processPostImage`）を壊さず、それを迂回された場合の保険として一往復のStorageダウンロードを足すだけで済む
- **スコープ:** `post-images`（公開バケット）のみ。`owner-documents`（非公開・PDF許容）や将来のアバター（D45未実装）への
  横展開はこのセッションのスコープ外 — 必要になれば別途判断する
- **実装上の注意（未検証だった点の確定）:** `exifr.gps()` に Node の Blob（`supabase.storage.download()` の返り値）を
  そのまま渡すとブラウザ専用の `FileReader` に依存して例外になる。`await blob.arrayBuffer()` で変換してから渡す必要がある
  （`lib/storage/post-image-verify.ts` 内で対応済み）
- **実装上の重大な注意（レビューで発覚・修正済み）:** `exifr`（7.1.3）は **WebPコンテナ自体を認識できない**
  （`"Unknown file format"` で例外）。post-images は必ずWebPのため、これに気づかず例外を「GPS無し」として握り潰すと
  この保険機能が常に無検出のまま素通りする（実質無意味）。逆に例外を安全側でブロックに倒すと**正常なWebP投稿が
  全滅する**致命的リグレッションになる（本セッション内で一度実際に発生し、レビューで検出）。
  対応: WebPのRIFFコンテナを自前でパースし `EXIF` チャンクの中身（生のTIFF/EXIFブロック）だけを取り出して
  `exifr.gps()` に渡す（TIFF単体は `exifr` が解釈できる）。EXIFチャンクが無ければGPSは原理的に存在しないため、
  `exifr` を呼ぶ前に確定させる。新規依存追加はしていない
- **テストの穴（教訓）:** 統合テストが「JPEGバイト列を `image/webp` と偽ってアップロード」するフィクスチャのみだと、
  上記のWebP非対応問題を検出できない（`exifr` はマジックバイトで実体を判定するため偶然JPEGとして正しく処理される）。
  **本物のWebPコンテナ**（EXIFチャンクあり/無し）を使う回帰テストを別途追加した
  （`tests/helpers/gps-exif-fixture.ts` の `buildGpsTaggedWebp` / `buildPlainWebp`）
- **関連:** [lib/storage/post-images.ts](../../lib/storage/post-images.ts) のバリデーションは形式・サイズのみで EXIF は検証しない

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

### B1. バッジ画像アセット ✅ 決定済み（2026-09-23）

- **必要枚数:** 20バッジ × 3階層（未取得/取得済/獲得エフェクト） = 約60枚
- **決定:** c) アイコンライブラリ（lucide-react、既存依存）+ 色バリエーションのみで実装する。
  AI生成（b）は20種×3階層の一貫性維持・著作権面の検討コストがMVP期間中は見合わないため見送り
- **解消済み（2026-09-23）:** 20バッジ×lucide-reactアイコンの対応表（badge code → icon）は
  `lib/badges/icons.ts` の `BADGE_ICONS` として作成済み（未知コードは `Award` にフォールバック）

### B2. Googleビジネスプロフィール連携（オーナー認証）（決定済み・2026-09-21）

- **決定:** MVPでは見送り、書類提出のみで S_OWNER_CLAIM を実装する。OAuth相当のフロー実装が
  技術的に可能か未検証のままスコープに入れるとPRが肥大化するため
- **再検討条件:** 書類審査の運用負荷が高いと判明した場合、フェーズ2で再検討
  - Google My Business API のドキュメント確認
  - 個人開発者でも利用可能なAPIか審査要件確認
  - 認証済み判定のペイロード確認

### B3. 保護者同意メールのテンプレート・送信基盤 🟢 決定・実装済み（2026-09-27）

- **決定:** Resend を採用。ワンタイムトークンは生の値をメールにのみ載せ、DBには
  `profiles.guardian_consent_token_hash`（SHA-256、hex）/ `guardian_consent_token_expires_at`
  （有効期限7日）としてハッシュだけを保持し、`approve_guardian_consent(p_token)` という
  anon 実行可の SECURITY DEFINER RPC で承認する（`GET /api/consent/confirm?token=...` から呼ぶ）
- **理由:** 保護者はメールのリンクを未ログインでクリックするため、承認処理はRLSを経由できる本人セッションを
  前提にできない。`guard_privileged_profile_columns` トリガーが `auth.uid() が null なら通す` 設計
  （20260905130000_create_profiles.sql）になっているのを利用し、anon から呼べるRPCに認可判断を閉じ込めた。
  ハッシュの一致・有効期限・`status='pending_consent'` の3条件がこの機能の唯一の防御線
- **レビューで発覚し設計変更した点:** 当初は生トークンをそのまま `profiles` に保存する設計だったが、
  `profiles_select_all` が `using(true)` で行も列も絞らないため、anon が
  `select('guardian_consent_token').eq('username', 'victim')` を直接叩けばトークンを盗み見て
  メールを介さず承認を偽装できてしまうと判明。列単位のGRANTで塞ぐ案は、Postgresでは
  「テーブル単位のSELECT権限を持つロールに対する列単位のREVOKEは効かない」ため
  `profiles` 全体の権限モデルを作り直す規模の変更になり見送った。代わりにSHA-256ハッシュのみを
  保存する方式に変更（生の値は一方向関数の入力側にしか存在しなくなる）。
  同じ理由で、profiles行がまだ無い間の一時保持先である `app_metadata` にも生トークンは置いていない
  ——`supabase.auth.getUser()` は本人が自分の `app_metadata` を読めるため、生トークンを置くと
  未成年本人が自己承認できてしまう
- **未実装のまま残した部分（意図的なスコープ外）:**
  - 拒否リンク（同意しない選択肢）はワイヤーフレーム（`docs/design/wireframes/auth.md`）に無いため実装していない
  - 独自ドメインのメール認証が未完了のため、送信元は `onboarding@resend.dev` 固定
    （`RESEND_FROM_EMAIL` で差し替え可能）。認証完了後に切り替える
- **既知の制約（設計上のトレードオフ）:** 保護者の同意クリックと未成年本人のブラウザは別セッションのため、
  同意してもJWTは即時反映されない。`/account/pending` に追加した「状態を確認する」ボタンで
  `refreshSession()` を明示的に呼ぶ運用にした（自然な期限切れを待たせない）
- **既知の制約2（/code-review で発覚・未対応）:** `approve_guardian_consent` は `profiles` テーブルしか
  見ないが、トークンは `/signup/consent`（保護者にメール送信する時点）で発行され、`profiles` 行は
  その後の `/onboarding/profile` 完了時にしか作られない。この間に保護者がリンクを踏むと
  （トークン自体は有効・未使用でも）該当行が無いため RPC は false を返し、`/account/pending` に
  `consent=invalid` として着地する。ただし **恒久的な失敗ではない** ——同じリンクは
  未成年が `/onboarding/profile` を終えた後に踏み直せば通る（トークンの有効期限7日以内なら）。
  サインアップは強制的な一本道フローで数十秒〜数分しかかからない一方、保護者がメールを開くまでの
  時間はそれより長いのが通常のため、実際に踏む頃には行が存在している可能性が高いと判断し、
  `profiles` 行が無い間も承認できるようにする対応（`auth.users.app_metadata` 側も見る等、
  auth スキーマを直接読み書きする SECURITY DEFINER 関数が必要でリスクが大きい）は見送った。
  `/account/pending` の invalid 表示は「登録の途中である可能性」に言及する文言にして
  緩和している（`app/(auth)/account/pending/page.tsx`）
- **既知の制約3（/code-review で指摘・意図的に受容）:** 同意リンクは `GET`
  （ワイヤーフレームが「メール内のリンクをクリックするだけ」の一発承認を明示しているため）。
  メールセキュリティゲートウェイ（Outlook Safe Links等）がクリック前にリンクを事前アクセスすると、
  保護者が実際にクリックする前にトークンを消費してしまいうる。これは業界共通の既知のトレードオフ
  （Supabase自身のメール確認リンクも含め、多くのサービスがGETの一発リンクを採用している）で、
  クリック確認ページを挟む二段階化はワイヤーフレームの一発承認という意図に反するため見送った。
  実害が出た場合の対処: トークンの有効期限内に「再送する」で再発行すれば復旧できる
- **既知の制約4（/code-review で発覚・解消済み・2026-09-27）:** `submitGuardianConsent` /
  `updateGuardianEmail` は `guardianEmail` が未成年本人のアカウントメールと異なるかを検証しておらず、
  本人が自分のメールアドレスを保護者メールとして入力すれば自分宛にリンクが届き自己承認できてしまっていた
  （DB列改ざん経由の自己承認バイパスとは別の、より単純な迂回路）。`GUARDIAN_EMAIL_SELF_FORBIDDEN`
  エラーコードを追加し、両アクションで本人メールと大文字小文字を無視して一致するか検証するガードを追加して解消
- **既知の制約5（/code-review で発覚・解消済み・2026-09-27）:** 再発行のクールダウン判定
  （`assertPendingConsent`、通常クライアントのSELECT）とトークン発行（`reissueGuardianConsentToken`、
  adminクライアントのUPDATE）が別々のDB往復のため原子性が無く、ほぼ同時に2回リクエストすると
  両方がクールダウンを通過して保護者に2通のメールが届きうる状態だった。加えてクールダウン判定は
  `guardian_consent_token_expires_at - GUARDIAN_CONSENT_TOKEN_TTL_MS` で発行時刻を逆算しており、
  TTL定数が将来変わると既発行トークンの解釈がずれる脆弱さもあった。専用列
  `guardian_consent_token_issued_at` を追加し（`guard_privileged_profile_columns` の対象にも追加）、
  送信前に「クールダウンを満たす場合のみ更新できる」原子的UPDATEでこの列を予約してから
  メール送信・最終保存する2段階の設計に変更して両方を解消した。送信が失敗しても予約は戻さない
  （クールダウンが再送信の乱発を防ぐ主目的のため、送信失敗時は次のクールダウンまで待たせる設計）
- **既知の制約6（/code-review で発覚・解消済み・2026-09-27）:** `guard_privileged_profile_columns` の
  コメントは「トークン列への書き込みはservice_role限定」と書いていたが、実装はrole/status/usernameと
  同じ `is_admin()` バイパスを流用しており、認証済みadmin自身のセッションからも書き換えられてしまって
  いた（コメントと実装の矛盾）。正規の書き込みは常にcreateAdminClient()経由という設計のため、
  is_admin()バイパスを外してコメント通りの制約に締めた

### B4. NGワード辞書の初期セット 🟢 決定（2026-09-21）

- **決定:** OSSの日本語NGワードリストを流用（選択肢 a）。初期セットは
  [seed/ng-words-initial-set.md](../seed/ng-words-initial-set.md) 参照
- **一致方式:** MVPは単純な部分一致（大文字小文字を無視した文字列包含）。語境界一致・曖昧一致は将来検討
- **成長後:** 外部AIモデレーション（Perspective API 等）への移行を検討（選択肢 c）
- 参照: [D49](#d49-ng_words-severitywarn-の運営レビューキュー送りを見送り)（`severity=warn` の扱いは別途見送り）

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

### B8. 登録者本人がカフェ情報を編集できない（未認証オーナー期間中） ✅ 解消済（2026-09-20）

- **課題:** `cafes` の UPDATE は `verified_owner_id = auth.uid()` か admin のみ（[tables.md #cafes](../architecture/data-model/tables.md#cafes) 通りの実装）。誰でもカフェを新規登録できる一方、登録者自身は `verified_owner_id` が付くまで自分の登録内容を一切編集できない
- **決定: b) を採用。** `created_by = auth.uid() and verified_owner_id is null and is_active_user()` の間だけ本人にも UPDATE を許可する RLS ポリシーを追加した（[`20260920140000_allow_cafe_creator_update.sql`](../../supabase/migrations/20260920140000_allow_cafe_creator_update.sql)）。`verified_owner_id` が付与された後（オーナー認証完了後）はこの経路が閉じ、従来どおり `verified_owner_id` 一致者のみ編集可能
- **理由:** MVP初期はユーザー登録カフェが大半になり、店名の打ち間違い等の軽微な修正のたびに admin 対応するのは運用コストが見合わない
- **検証:** `tests/integration/cafes-rls.test.ts` に本人（未認証・認証済み・suspended）・他人それぞれの UPDATE 可否を確認するケースを追加
- 参照: `/code-review` によるセルフレビュー（2026-09-06、cafes テーブル実装時） / S_CAFE_NEW 実装時の決定（2026-09-20）

### B9. カフェの重複登録を防ぐ一意制約がない ✅ 部分解消（2026-09-20）

- **課題:** `cafes.name` にも `external_ids` にも一意制約がなく、同じ店が何度でも登録できる。`posts` 等の後続テーブルが `cafe_id` を FK で持つ設計のため、重複が発生してからのマージは高コストになる
- **決定（v1）: DB側の一意制約は張らない。** S_CAFE_NEW のカフェ名入力にアプリ層の警告のみ実装した（`findSimilarCafes` server action、`app/(browsing)/cafes/new/cafe-new-form.tsx`）。名前の ilike 部分一致で似た既存カフェを表示するが、送信自体はブロックしない
- **理由:** `external_ids->>'google_place_id'` ベースの一意インデックスという対応案は、Google Maps/Places のクライアント側統合が未実装（このプロジェクトに1行も存在しない）のため今は効かせられない。本格的な重複防止は Google Maps 統合スコープに持ち越す
- **残作業:** Google Maps 統合時に、対応案（`external_ids->>'google_place_id'` への部分一意インデックス）を再評価する
- 参照: `/code-review` によるセルフレビュー（2026-09-06、cafes テーブル実装時） / S_CAFE_NEW 実装時の決定（2026-09-20）

### B10. `cafes.name` に部分一致検索用インデックスがない

- **課題:** `name_kana` には `GIN(name_kana gin_trgm_ops)` があるが `name` には無い。カフェ名検索の主な入力は店名そのもの（例:「ブルーボトル」）で、フリガナ入力は少数派と想定される
- **対応方針:** カフェ検索機能の実装時に、`name` への trgm インデックス追加を再検討する
- **決定期限:** カフェ検索実装前
- 参照: `/code-review` によるセルフレビュー（2026-09-06、cafes テーブル実装時）

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
  - `profiles.avatar_url`（アバター変更時の旧ファイル）— **対応案c で解消済み（2026-10-03、D45参照）**。
    残る対象は `post_images` / `drafts` / `cafe_owner_verifications` / `cafes.main_image_path`
- **対応案:**
  - a) DB トリガーで削除キューに積み、[A6 のスケジューラ](#a6-pg_cron-が-supabase-free-で使えない問題--解消済2026-09-05)がまとめて Storage から消す
  - b) 日次バッチで参照されていないオブジェクトを走査して削除
  - c) DB削除時に Server Actions から明示的に Storage delete を呼ぶ
- **決定期限:** ストレージ量が実運用で膨らむ前。**Free 枠が 1GB しかないため、A5 の想定より早く効いてくる可能性がある**

### D4. `post_tags` の5個上限のDB制約 ✅ 解消済（2026-09-07）

- **課題（経緯）:** UIで「タグ最大5個」を謳っているが、`post_tags` テーブルに `CHECK` 制約や BEFORE INSERT
  トリガーがなかった
- **決定:** [`20260907120200_create_post_tags.sql`](../../supabase/migrations/20260907120200_create_post_tags.sql)
  の BEFORE INSERT トリガー `enforce_post_tags_limit()` で `COUNT(*) >= 5` を拒否する（`post_images` の10枚上限も
  同じパターンで実装）。カウントは `posts_select` を継承する SELECT RLS 越しだと投稿を `archived` にして迂回
  できてしまうため `SECURITY DEFINER` にしてある
- `tests/integration/posts-rls.test.ts` に上限到達時のエラー・`archived` にしてからの迂回不可を確認するケースを追加

### D5. Route Group 名 `browsing` の命名見直し

- **課題:** Next.js コミュニティでは `(marketing)` / `(public)` / `(guest)` が一般的
- **影響:** 動作には影響なし。将来の共同開発時の学習コスト
- **対応判断:** 実装開始時に決定。変更しないままでも問題なし
- **推奨（2026-09-05）: `(browsing)` のまま進める。** 一般的な `(public)` は「未ログインでも見える」を含意するが、`(browsing)` 配下には `/cafes/new`（要ログイン）が入っており、名前と権限が一致しない。どの名前でも誤解は残るので、既に37画面のドキュメント全体で使われている現行名を変えないほうが安い

### D9. `badges.criteria` の JSON が全20件ぶん書かれていない ✅ 解消済（2026-09-05）

- **決定:** 20件ぶんの `criteria` を確定し [`supabase/migrations/20260905120400_seed_master_data.sql`](../../supabase/migrations/20260905120400_seed_master_data.sql) に投入した。type 一覧と各フィールドは [seed/badges-initial-set.md #badgescriteria-の構造確定-2026-09-05](../seed/badges-initial-set.md) を正とする
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
- **2026-09-25 追記: エージェントパイプライン導入で影響範囲が広がった**
  ([agent-pipeline.md](../operations/agent-pipeline.md) 参照)
  - `agent-review.yml`（エージェントによる差分レビュー）を**必須ステータスチェックにできない**。
    指摘があればジョブは落ちるが、マージは止まらない。**現状は助言役にとどまる**
  - `gh pr merge --auto --squash` が使えず、`agent-implement.yml` は
    PR を立てるところまでで止まる（マージは人）
  - 実測: `branches/main/protection` と `rulesets` は 403、
    `allow_auto_merge=true` は PATCH してもエラーなく false のまま
  - **回避策（ワークフローやエージェント自身にマージさせる）は採らない方針。**
    ゲートの強制主体が GitHub から自前コードに戻り、
    「エージェントが自分の関門を迂回できる」構造になるため
- **対応案:**
  - a) GitHub Pro に加入 ($4/月) して protection/rulesets を有効化
    → `Agent Review` を必須チェックに登録でき、無人マージも解禁される。
      Actions 予算 $5 と合わせて月 $9
  - b) リポジトリを Public 化して protection を無料で有効化
  - c) 現状維持（個人開発の自己規律で補完）
- **決定期限:** チームメンバーが増える時、または PMF 後。
  ただし**エージェントによるレビューをマージの門番にしたくなった時点**でも判断が必要になる

### D10. 統合テスト（RLS検証）が CI で実行されていない

- **課題:** `ci.yml` は `pnpm test:run`（ユニット）のみで `pnpm test:integration` を実行しない。RLS はこのプロジェクトの認可の中核（アプリ層で認可を書かず RLS に委譲する方針）だが、その安全網はローカルでしか回っていない
- **対応方針:** CI に Supabase CLI（`supabase start` 相当）を立てるジョブを追加し、`pnpm test:integration` を回す
- **決定期限:** 別 issue / 別PR で対応。テーブル実装のたびに手動実行漏れが起きうるため優先度は中
- 参照: `/code-review` によるセルフレビュー（2026-09-06、cafes テーブル実装時）

### D11. `is_admin()` は `revoke ... from public` 後も anon から呼べる（意図と実態のズレ）

- **課題:** [`20260905130000_create_profiles.sql`](../../supabase/migrations/20260905130000_create_profiles.sql) は
  ```sql
  revoke execute on function public.is_admin() from public;
  grant execute on function public.is_admin() to authenticated, service_role;
  ```
  で `anon` を締め出したつもりだったが、実際には締め出せていない。`revoke ... from public` が消すのは **PUBLIC 疑似ロール**への権限だけで、Supabase が `public` スキーマの新規関数作成時にデフォルト権限で `anon`/`authenticated`/`service_role` へ**直接**付与する EXECUTE には効かない（`pg_default_acl` で実測確認済み）。結果として `anon` は今も `is_admin()` を呼べる
- **実害:** 現状は無い。`anon` から呼んでも `auth.uid()` が `NULL` になるため常に `false` を返す
- **対応方針:** `anon` を本当に締め出す意図なら、後続マイグレーションで `revoke execute on function public.is_admin() from anon;` を明示する。この場合、[cafes のロール別 SELECT ポリシー分割](../architecture/data-model/tables.md#cafes)（`anon` 経路では `is_admin()` を一切呼ばない設計）は「望ましい設計」から「無いと壊れる必須の構造」に格上げされる
- **決定期限:** 実害が無いため急がないが、`is_admin()` を anon から呼ぶ新しいポリシーを書く前には確認する
- 参照: `/code-review` によるセルフレビュー（2026-09-06、cafes テーブル実装時のレビューで発覚）

### D8. Biome バージョン Bump 時の手順

- **課題:** Dependabot が Biome を bump した PR は `biome.json` の `$schema` が古いバージョンURLのまま残る。
  Dependabot は `package.json` と `pnpm-lock.yaml` しか触らないため、設定ファイル側は手で追従させる
- **⚠️ 旧記述の訂正（2026-09-19 実測）:** ここには「`$schema` が古いと **lint 失敗する**」と書かれていたが、
  **事実と異なる。** `$schema` を実バージョンとずらして `pnpm lint` を実行すると、
  `i Run the command biome migrate to migrate the configuration file.` が出るだけで
  **終了コードは 0**、CI も落ちない。**マージのブロッカーではない**（PR #43 の Lint ジョブも green だった）。
  この誤りを残すと、次の bump で存在しない失敗の調査に時間を使うため訂正した
- **対応手順（Bump 時に実施。マージ前でもマージ後でもよい）:**
  1. `biome.json` の `$schema` を新バージョン URL に更新 ← **patch bump で実際に要るのはこれだけ**
  2. `pnpm exec biome migrate --write` で設定移行（patch では `no migration needed` になる）
  3. `pnpm exec biome check --write` で再フォーマット（patch では差分ゼロ）
- **2.5.12 → 2.5.13 の実績（2026-09-19）:** 手順2は `no migration needed`、手順3は差分なし。
  **minor / major の bump では 2・3 が効く可能性があるため、手順自体は残す**
- **自動化候補:** Dependabot 用 GitHub Actions workflow で PR 更新後に自動 biome migrate を実行
- **決定期限:** Biome bump が頻繁に来るようになった時

### D12. `cafes_insert_authenticated` / `cafes_update_owner` の `profiles.status='active'` ガード欠落 ✅ 解消済（2026-09-06）

- **課題:** [`20260906130000_create_cafes.sql`](../../supabase/migrations/20260906130000_create_cafes.sql) の
  `cafes_insert_authenticated` は `created_by = auth.uid()` のみ、`cafes_update_owner` は `verified_owner_id = auth.uid()`
  のみを検査しており、CLAUDE.md の必須ルール「未成年アカウントは追加のガード（RLSで `profiles.status = 'active'`
  チェック）」を満たしていない。`suspended` / `pending_consent` のアカウントでも新規カフェの登録・既存カフェの更新が
  できてしまう
- **決定:** [`20260906150000_guard_cafes_write_active_user.sql`](../../supabase/migrations/20260906150000_guard_cafes_write_active_user.sql)
  で `alter policy` を使い、`cafes_insert_authenticated` / `cafes_update_owner` の両方に `is_active_user()` ヘルパーを
  組み込む（admin は既存の `cafe_business_hours` 系ポリシーと同様に active チェックをバイパス）。
  `tests/integration/cafes-rls.test.ts` に `status=suspended` ユーザーが INSERT / UPDATE のどちらもできないことを
  確認するケースを追加
- 参照: `/code-review` によるセルフレビュー（2026-09-06、cafe_business_hours / cafe_congestion_reports 実装時のレビューで発覚。
  当初はINSERTのみ修正したが、その後のフォローアップレビューでUPDATE側の同種ガード欠如を追加指摘）

### D13. `follows_insert_own` / `user_interest_tags_insert_own` に `profiles.status='active'` ガードがない ✅ 解消済（2026-09-06）

- **課題（経緯）:** D12 と同種の問題。[`20260905130300_create_follows_and_blocks.sql`](../../supabase/migrations/20260905130300_create_follows_and_blocks.sql)
  の `follows_insert_own` と [`20260905130200_create_user_interest_tags.sql`](../../supabase/migrations/20260905130200_create_user_interest_tags.sql)
  の `user_interest_tags_insert_own` は本人チェックのみで `is_active_user()` を経由しておらず、`suspended` /
  `pending_consent` のアカウントでもフォロー・興味タグの登録ができてしまっていた
- **決定:** [`20260906160000_guard_follows_tags_insert_active_user.sql`](../../supabase/migrations/20260906160000_guard_follows_tags_insert_active_user.sql)
  で `alter policy` を使い、`follows_insert_own` / `user_interest_tags_insert_own` の両方に `is_active_user()` ヘルパーを
  組み込む。`tests/integration/follows-blocks-rls.test.ts` / `tests/integration/user-interest-tags-rls.test.ts` に
  `status=suspended` ユーザーが INSERT できないことを確認するケースを追加
- **`blocks_insert_own` の判断結果:** 見送り。ブロックは被害者保護のための機能であり、`suspended` / `pending_consent`
  のユーザーにもブロック手段を残す方針とし、ガードは追加しなかった
- 参照: `fix/cafes-insert-active-guard` ブランチの `/code-review`（2026-09-06、D12対応時のレビューで横展開の要否として指摘）

### D14. `posts.body_text` にタイトルが含まれず、ブログのタイトルが `pg_trgm` の部分一致対象外

- **課題:** [tables.md #全文検索の方式](../architecture/data-model/tables.md#全文検索の方式) は「日本語の部分一致は
  `pg_trgm` が主役、`simple` tsvector（`body_search`）は英数字の語一致の補助」と定義しているが、実装
  （[`20260907120000_create_posts.sql`](../../supabase/migrations/20260907120000_create_posts.sql)）では
  `title` は `body_search` にしか入っておらず `body_text`（`gin_trgm_ops` 索引側）には含まれない。`simple` 設定は
  空白区切りでしかトークン化しないため日本語のタイトルはほぼ効かず、結果としてブログのタイトルは
  日本語部分一致検索に一切引っかからない状態になっている
- **影響:** MVPの主動線は幹A（気分タグ起点の発見）で全文検索はあくまで補助のため、現時点でユーザー影響は顕在化していない
- **対応案:** `body_text` の生成式に `title` を含める（`coalesce(title, '') || ' ' || tiptap_to_plaintext(body_json)`
  のように）。生成列は他の生成列を参照できないため、`body_search` 側の式とは別に `body_text` 側の式も変更が必要
- **対応判断:** ブログ検索（タイトル検索）を実装するタイミングで解消する。それまでは「ブログのタイトルは
  部分一致検索に乗らない」既知の制約として扱う
- 参照: `feat/posts-schema` ブランチの `/code-review`（2026-09-07、posts初期実装のレビューで指摘。同時に指摘された
  「上限トリガーの同時INSERTレース」は許容範囲のトレードオフとして対応見送り — 低頻度操作であり、レースが起きても
  実害は「上限を1〜2件超える」程度）

### D15. 署名付きアップロードURL発行の事前カウントチェックに TOCTOU レースがある

- **課題:** `createPostImageUploadUrl`（[`lib/storage/post-images.ts`](../../lib/storage/post-images.ts)）は
  `post_images` の件数を事前カウントして10枚上限をチェックしているが、カウント対象の行は
  クライアントが署名付きURLへ実ファイルをPUTした**後**でないとINSERTされない。9枚保存済みの投稿に対して
  `POST /api/uploads/sign` を並行N回叩くと、全リクエストがカウント9を読んで上限チェックを通過し、
  全員が有効な署名付きURLを取得できてしまう。DB側の `enforce_post_images_limit()` トリガー
  （[D4](#d4-post_tags-の5個上限のdb制約--解消済2026-09-07)と同じ実装パターン）は `post_images` 行の
  INSERT時にしか働かないため、実際にアップロードされ Storage に残る画像ファイル自体は上限を超過し、
  かつ `post_images` 行を持たない**孤立オブジェクト**として残り続ける（[D3](#d3-storage-オブジェクトのオーファン掃除方針)
  の掃除対象を増やす形にもなる）
- **影響:** MVPは低トラフィック想定であり同一投稿への並行アップロードは稀。実害は「上限を数枚超える」
  程度で、D14で許容した「上限トリガーの同時INSERTレース」と同種のトレードオフ
- **対応案:** a) 署名発行時に `post_images` へ pending 状態の予約行を先に作る（実ファイルアップロード確認は
  別途） b) Postgres アドバイザリロックで発行を投稿単位に直列化する c) 対応せず低頻度リスクとして許容し、
  D3の孤立オブジェクト掃除バッチ任せにする
- **対応判断:** 未定。MVPでは c) 相当（対応見送り）で運用し、実運用でレースが顕在化したら a) を検討する
- 参照: `feat/uploads-sign-route` ブランチの `/code-review`（2026-09-08、Route Handler実装時のレビューで指摘）

### D16. `POST /api/uploads/sign` に発行レート制限がない

- **課題:** 認証済みユーザーは `POST /api/uploads/sign` を無制限に呼べる。1投稿あたり画像10枚の上限
  （事前カウントは[D15](#d15-署名付きアップロードurl発行の事前カウントチェックに-toctou-レースがある)、
  トリガー実装パターンの出典は[D4](#d4-post_tags-の5個上限のdb制約--解消済2026-09-07)）はあるが、
  投稿自体を量産すれば実質無制限に post-images バケットへ最大10MB/枚の書き込みが可能になる
- **影響:** [A5](#a5-画像ストレージの正をどちらにするか--解消済2026-09-05) の通り Supabase Storage の Free 枠は
  1GBしかなく、悪意がなくてもクライアントの再送バグ等で枠を圧迫し得る
- **対応案:** `RATE_LIMITED`（`types/errors.ts` に定義済み）を使い、ユーザー単位・時間窓での発行回数制限を
  Route Handler か Supabase 側（Edge Function レート制限機能等）に入れる
- **対応判断:** 未定。MVPでは対応見送り。Storage使用量の月次確認（A5参照）で異常増加が見えたら優先度を上げる
- 参照: `feat/uploads-sign-route` ブランチの `/code-review`（2026-09-08、Route Handler実装時のレビューで指摘）

### D17. `createPost` の `imagePaths` は「画像アップロード時点で投稿行が既に存在する」ことを前提にしている（解消済み）

- **課題:** `POST /api/uploads/sign`（`createPostImageUploadUrl`）は `is_post_author(postId)` で
  投稿の実在と所有者を確認してから署名付きURLを発行する（[`lib/storage/post-images.ts`](../../lib/storage/post-images.ts)）。
  一方 `createPost`（[`app/_actions/posts.ts`](../../app/_actions/posts.ts)）は `imagePaths`
  （アップロード済み画像のパス配列）を受け取って `posts` 行の作成と同時に `post_images` へ書き込む設計になっており、
  `posts` 行自体は `createPost` 呼び出し時点で初めて作られる。両者を素直に繋ぐと「画像をアップロードするための
  signed URL を発行するには先に `posts` 行が要る」が「`posts` 行は `createPost`（＝画像込みの最終確定）でしか作れない」
  という循環になる
- **影響:** S_POST_SHORT / S_POST_BLOG のワイヤーフレーム（[design/wireframes/composer.md](../design/wireframes/composer.md)）は
  「投稿する」ボタンを押す前に画像をプレビュー表示する UI を想定しており、この循環を解消しないと composer 画面が実装できない
- **対応判断（2026-09-11、決定）:** 案 a) 予約行方式を採用。`app/_actions/posts.ts` に
  `reservePost({ postType })` を新設し、composer 表示開始時（または最初の画像選択時）に
  空本文・`status='hidden'` の `posts` 行を先に作る。`createPostImageUploadUrl` はこの
  `postId` に対してそのまま使える（変更不要）
- **finalize の実装方式（2026-09-11、`/code-review` 3回の指摘を経て確定）:**
  `createPost` は本文/タグ/カフェ/公開範囲/画像の確定を Postgres 関数 `finalize_post`
  （RPC、`security invoker`）に**1回のトランザクションとして**任せる
  （`supabase/migrations/20260911134931_finalize_post_rpc.sql`）:
  1. 冒頭で `SELECT id FROM posts WHERE id = p_post_id AND status = 'hidden' AND post_type = p_post_type FOR UPDATE`
     により対象行をロックする。行が見つからなければ（他人の postId・既に finalize 済み・
     予約時と異なる postType）`raise exception 'FORBIDDEN'`
  2. 本文フィールドを `UPDATE`、`post_images`/`post_tags` を `INSERT`、最後に
     `status='published'` へ `UPDATE` — すべて同一トランザクション内
  3. imagePaths は `app/_actions/posts.ts` 側で事前に `{author_id}/{postId}/` 配下であることを
     検証してから RPC を呼ぶ（postId 側まで見ることで、他の自分の投稿の画像を
     横取りする心配がなくなる）
  - **なぜ手動ロールバック方式（本文 UPDATE → insert → status UPDATE を別々の文で行い、
    失敗時にアプリ側で取り消す）を廃止したか:** 最初の実装は「失敗時に予約行と画像まで
    消える」「postType の食い違いを検出できない」という指摘（1回目のレビュー）を経て
    修正したが、さらに深掘りすると**別々のリクエスト同士を手動の補償処理で整合させようと
    する構造そのものに穴が残っていた**（2回目のレビュー）: 同じ postId への二重送信で、
    双方が本文 UPDATE（`status='hidden'`条件）を通過した後に `post_images`/`post_tags` の
    insert が絡み合うと、どちらも publish まで進めず画像・タグだけ入った hidden 投稿の
    まま行き詰まり、再送しても同じ一意制約違反（`storage_path` に追加した一意制約含む）で
    抜け出せなくなるケースがあった。一意制約を足すやり方では塞ぎきれないため、
    finalize 全体を1トランザクションの RPC にまとめる方式に全面移行した。
    行ロック（`FOR UPDATE`）により同じ postId への同時呼び出しは自動的に直列化され、
    後着は「対象が見つからない」`FORBIDDEN` になるだけで、双方が中途半端な行を残す
    ことは構造的に起こらない。これにより手動の `rollbackFinalizeInserts` や
    `CONFLICT`（一意制約違反）分岐は不要になった（`CONFLICT` は行ロックでは本来
    到達しないはずの想定外系に対する保険としてのみ残す）
  - `post_images.storage_path` の一意制約（`20260911124750_add_post_images_storage_path_unique.sql`）
    は、行ロックによる直列化が主たる防御になった後も、スキーマ側の整合性担保として残す
  - `drafts.payload.image_paths`（[tables.md #drafts](../architecture/data-model/tables.md#drafts)）は
    「画像は選択時点でアップロード済み」という前提のままで矛盾しない（予約行のフォルダに
    アップロードされるだけ）。composer 実装時は `drafts.payload` に `postId` も持たせ、
    同じ下書きを再開したときに予約行を作り直さないようにする（未実装、次のスコープ）
  - **本番適用前の確認事項:** `post_images.storage_path` への一意制約は既存データに重複が
    あると `ALTER TABLE` が失敗する。本番の承認ゲートを通す前に Supabase Cloud で
    `select storage_path, count(*) from post_images group by 1 having count(*) > 1` を
    実行し、重複が0件であることを確認すること（`/code-review` 指摘、未実施）
  - **Storage の画像は finalize 失敗時に消さない（2026-09-11、`/code-review` 4回目・5回目で
    往復して確定）:** RPC 化で `post_images`/`post_tags` の DB 行はトランザクション単位で
    自動ロールバックされるようになった一方、`finalize_post` 呼び出し前にクライアントが
    署名付きURLでアップロード済みの Storage 実体（`post-images/{author_id}/{postId}/*.webp`）は
    自動では消えない。一度は「孤立オブジェクトだから消すべき」と考え旧 `rollbackPost` の
    `deletePostImages` 呼び出しを復活させたが、それは誤りだった: **予約行（`posts`、
    `status='hidden'`）とそのフォルダは finalize が失敗しても残り続けるため、画像は
    孤立しておらず「再送でそのまま使い直す」設計になっている。** ここで Storage を消すと、
    ユーザーがエラー（例: 存在しないカフェを選んでいた・一時的なエラー）を直してから
    同じ postId・imagePaths で再送したとき、`post_images` には Storage との FK が無いため
    insert 自体は成功してしまい、**画像ファイルが存在しない投稿がそのまま公開される**という
    別の不具合を生む。結論として `createPost` は finalize 失敗時に Storage 側を一切操作しない。
    本当に二度と finalize されない放置画像の掃除は、予約行そのものの掃除（D19）とセットで
    まとめて扱う
  - **未解決のフォローアップ:** [D19](#d19-reservepost-で予約した-hidden-投稿がfinalizeされないまま放置される問題) を参照
- 参照: `feat/posts-create-action` ブランチでの `createPost` 実装時に発見（2026-09-09）。
  `docs/resolve-d17` での方針決定・実装、`/code-review` 5回分の指摘対応（2026-09-11）

### D18. `posts_select_own` 修正PRの軽微な指摘（対応不要と判断・記録のみ）

- **課題:** [D14](#d14-postsbody_text-にタイトルが含まれず-ブログのタイトルが-pg_trgm-の部分一致対象外)
  と同じ `posts`/`post_images`/`post_tags` 周りの作業（`test/posts-create-integration-verify`
  ブランチ、`posts_select_own` ポリシー追加で `createPost` の hidden→published UPDATE が
  無言で失敗するバグを修正）の `/code-review` で、マージ可否には影響しない2点が指摘された:
  1. `tests/integration/posts-create-flow.test.ts` のロールバック回帰テスト末尾で
     `postIds.length = 0`（配列全体クリア）を使っている。現状は1テストにつき1件しか
     `push` しないため実害はないが、意図に忠実なのは該当IDだけを消す `postIds.pop()`
  2. `posts_select_own` 導入後は RLS が「削除済み・非公開投稿を隠す安全網」ではなくなったため、
     一覧・タイムライン系クエリで `status='published' AND deleted_at IS NULL` を
     アプリ層で明示する規約を `tables.md` に文章として記載済みだが、コードでの強制（
     `scripts/check-design-system.sh` 相当の `from('posts').select(` 検査等）はまだない
- **影響:** どちらも現時点で実害はゼロ（1は配列が常に単一要素、2は `posts` を読む一覧クエリが
  まだ1本も存在しない — `grep from('posts')` は insert/update/delete のみ）
- **対応判断:** 見送り。1は次にこのテストを触る際のついでで直せば十分。2は「3回同じパターンが
  出てから抽象化」の原則（CLAUDE.md 開発哲学4）に従い、タイムライン系の一覧クエリを実装し始めて
  パターンが複数出てきた時点で自動検査の要否を判断する
- 参照: `test/posts-create-integration-verify` ブランチの `/code-review`（2026-09-10、
  `posts_select_own` 追加PRのレビューで指摘）

### D19. `reservePost` で予約した hidden 投稿がfinalizeされないまま放置される問題

- **課題:** [D17](#d17-createpost-の-imagepaths-は画像アップロード時点で投稿行が既に存在することを前提にしている解消済み)
  の予約行方式では、composer を開いて画像を選んだだけでユーザーが離脱すると、空本文・
  `status='hidden'` の `posts` 行と、それに紐づく `post_images`/Storage オブジェクトが
  finalize（`createPost`呼び出し）されないまま残り続ける。`drafts`（30日で `expires_at`
  失効・削除想定）と違い、予約行にはまだ有効期限の仕組みがない
- **影響:** MVP検証中は投稿数が少なく実害は小さいが、放置すると `posts`/`post_images` に
  ゴミ行が溜まり、Storage 無料枠（1GB、[README.md #無料枠の制約](../architecture/data-model/README.md#無料枠の制約)）
  も無駄に消費する。[D3](#d3-storage-オブジェクトのオーファン掃除方針)（Storage オーファン掃除方針、未決）と対象は近いが、D3 は
  「post_images 行はあるが Storage 実体が無い/その逆」を指しており、こちらは「posts 行自体が
  最後まで使われない」という別種の孤立
- **対応案（未検討・要判断）:** a) `drafts` と同様に `posts.status='hidden'` かつ一定時間
  （例: 24時間〜7日）更新が無い行を日次バッチ（Edge Function + GitHub Actions、A6と同じ仕組み）
  で削除する b) `posts` に `reserved_at`/`expires_at` 相当の列を足す c) hidden 行の生存期間は
  `created_at`/`updated_at` の既存列で判定し、専用列は増やさない
- **関連課題:** `reservePost` には回数制限が無く、1ユーザーが `hidden` 予約行を連打で
  大量に作れてしまう（掃除バッチが間に合わない速度で溜まる可能性がある）。掃除処理の
  設計とあわせて、レート制限（`RATE_LIMITED`、[D16](#d16-post-apiuploadssign-に発行レート制限がない)と同様の考え方）の要否も判断する
- **対応判断:** 未定。投稿数が増えて実害が見え始めた時点で優先度を判断する
- **composer 実装後に判明した発生パターン（2026-09-13）:** 実際に予約行が残るのは以下。
  掃除方針を決める際はこの4通りを想定する
  1. 形式選択（`/new/short` `/new/blog`）を開いた瞬間に必ず1行。何も書かずに戻れば残る
  2. 下書きの初回自動保存（15秒デバウンス）より前にリロードすると、URL の `?draft=` に
     対応する `drafts` 行がまだ無く、再開できずに新しい予約行が作られる
  3. 離脱ダイアログの「下書きを破棄する」は `drafts` 行だけを消す。予約行と
     アップロード済み画像は意図的に残している（`createPost` 失敗時に画像を消さない判断と同じ理由）
  4. `createPost` が失敗した投稿の予約行（再送で使い回せるよう残す）
- **ブログ本文に埋め込んだ画像は `post_images` の管理外（2026-09-13）:** Tiptap の本文に挿入した
  画像は Storage には置かれるが `post_images` 行を作らない（本文JSONに公開URLを持つだけ）。
  そのため a) 署名付きURL発行時の10枚チェック（`post_images` の件数を数える）が効かない
  b) 投稿削除時の `deletePostImages`（`post_images` 行が起点）で消えず孤立する。
  a) は composer 側で同じ上限を数えて暫定的に塞いだが、b) は未対応。
  掃除方針を決める際は「本文JSONから画像パスを抽出して突き合わせる」必要がある
  なお開発時の React StrictMode による二重 `reservePost` は `useComposer` の
  ref ガードで防いでいる。このガードと「cleanup で進行中の初期化を捨てる」方式は併用できない
  （1回目が捨てられ、2回目はガードで即 return するため画面が loading から進まない）ため、
  cleanup 側では中断しない（`components/features/composer/use-composer.ts`）
- 参照: D17 対応（案a採用）に伴う新規フォローアップとして記録（2026-09-11）

### D20. composer の「おすすめタグ」は位置情報ベースではない

- **課題:** [wireframes/composer.md](../design/wireframes/composer.md) の S_POST_SHORT は
  「おすすめタグ（位置情報より）」として `[+ 表参道]` のようなエリア名タグを想定していたが、
  `tags` マスタに `area` カテゴリの行は存在しない（エリアの正は `areas` マスタという設計判断。
  `supabase/migrations/20260905120400_seed_master_data.sql`）。エリア名のタグを出すには
  areas → tags の橋渡しか、`post_tags` とは別の「エリア付与」の仕組みが要る
- **現在の実装:** おすすめ枠は `user_interest_tags`（オンボーディングで選んだ気分タグ）から出す。
  ホームエリア起点のデフォルト効果はカフェ検索側が担い、検索語が空のときは
  `profiles.home_area_code` のカフェを初期候補として並べる
- **対応案（未検討）:** a) 現状維持（エリアはタグではなくカフェ経由で付く、と整理する）
  b) `areas` から `tags`（category='area'）を生成する c) ブラウザの Geolocation API と
  PostGIS の近傍検索で「今いるエリア」を推定する（権限ダイアログの摩擦とのトレードオフ）
- **対応判断:** 未定。気分検索（幹A）の運用データが出てから判断する
- 参照: composer 実装時に判明（2026-09-13）

### D21. S_POST_BLOG の「プレビュー」ボタンが未実装（解消済み）

- **課題:** ワイヤーフレームにはブログ投稿の「プレビュー」ボタンがあるが、投稿詳細
  （S_POST_DETAIL `/posts/[id]`）の表示実装がまだ無く、プレビューに使う描画側が存在しない。
  composer 側だけ先に作ると Tiptap JSON の描画ロジックが2箇所に分かれる
- **解消（2026-09-14）:** S_POST_DETAIL の実装で Tiptap JSON の描画を
  [`components/features/posts/post-body.tsx`](../../components/features/posts/post-body.tsx)
  （JSON を再帰的に React 要素へ変換。`generateHTML()` + `dangerouslySetInnerHTML` は使わない）に一本化し、
  composer のプレビュー（`components/features/composer/preview-dialog.tsx`）も同じものを使う。
  見出し・リスト等の Tailwind も `components/features/posts/rich-text.ts` に集約し、
  エディタ（編集中）と表示で同じ定義を共有する
- 参照: composer 実装時にスコープ外と判断（2026-09-13）→ S_POST_DETAIL 実装で解消（2026-09-14）

### D23. 閲覧系ページが routing.md の想定どおりにキャッシュされていない

- **課題:** [routing.md](../architecture/routing.md) は S_POST_DETAIL を **ISR (300s)** としていたが、
  実装は毎リクエストDBを読む SSR になっている（`export const revalidate` は誤解を招くため置いていない）
- **切り分け（2026-09-14〜15、Next.js 16.3.4 の本番ビルドで実測）:** 検証用ルートを2本作って比較した
  - `/cache-probe`（静的パス・`revalidate = 300`・cookie を読まない anon 取得）
    → DBを書き換えても古い値を返し続ける＝**キャッシュされる**
  - `/cache-probe/[id]`（上と同条件で**動的セグメントのみ違う**）
    → 書き換えが即反映される＝**キャッシュされない**
  - 結論: 動的セグメントのルートは `generateStaticParams` が無いと、`revalidate` を置いても
    フルルートキャッシュに載らない。**加えて**現在の実装は認可のため必ず `await cookies()` を通るので、
    仮に前者を解決しても静的レンダリングからは外れる（原因は2つあり、どちらか一方では足りない）
- **認可側の制約（重要）:** `posts_select` の最終条件 `not is_blocked_either_way(author_id)` は
  `auth.uid()` が null の anon では常に真になる。つまり「公開投稿を anon で静的に描く」と、
  **ブロックした相手の投稿がブロック中のユーザーにも見える**。ISR 化はキャッシュの話だけでは済まず、
  ブロック判定をどこで効かせるかとセットで設計する必要がある（`/code-review` の指摘で判明、2026-09-14）
- **影響:** 公開投稿の TTFB がリクエストごとの DB 往復に引きずられる。表示内容・認可は正しい（実害は速度のみ）
- **対応案（未検討）:** a) `generateStaticParams` で人気投稿を事前生成し、ブロック判定はクライアント側で
  落とす b) Next.js 16 の `cacheComponents` + `"use cache"` を有効化して読み取り関数をキャッシュする
  （設定変更＝スタックに影響するため要相談） c) routing.md 側を SSR に確定させて ISR を諦める
- 参照: S_POST_DETAIL 実装時に判明（2026-09-14）／原因の切り分けは 2026-09-15
- **`/explore`・`/` への波及（2026-09-15）:** routing.md は S_EXPLORE を **ISR (60s)** としていたが、
  一覧も同じ `posts_select` を通るため anon で読むとブロック関係が効かない。閲覧者のセッション
  （`lib/supabase/server.ts` の `createClient()`）1本に統一し、routing.md の S_EXPLORE を **SSR** に訂正した。
  S_HOME はもともと SSR 想定（認証状態で分岐）なので変更なし
- **`/users/[username]` への波及（2026-09-16）:** routing.md は S_USER_PROFILE_PUBLIC を **ISR (60s)**
  としていたが、投稿グリッドが同じ `posts_select` を通るうえ、フォローボタンの初期状態と
  ブロック判定（`is_blocked_either_way`）にも閲覧者のセッションが要る。SSR に訂正した
- **`/cafes/[id]` への波及（2026-09-17）:** routing.md は S_CAFE_DETAIL を **ISR (300s)** としていたが、
  カフェ本体・営業時間は anon でも読めるものの、投稿グリッドが同じ `posts_select` を通るため
  anon で静的に描くとブロック関係が効かない。混雑度の報告フォームも閲覧者のログイン状態で
  出し分ける。SSR に訂正した（4件目。ISR に戻せる閲覧系ページは現時点で1つも無い）

### D24. S_EXPLORE の「おすすめ」タブが user_interest_tags の単純一致 ✅ 解消済み（2026-10-01、対応案b）

- **課題:** デフォルトタブ「おすすめ」の実体は、**オンボーディングで選んだ気分タグ
  （`user_interest_tags`）を1つでも持つ公開投稿を新着順に並べたもの**。スコアリングも
  多様性の担保も無く、興味タグ未設定のユーザーと未ログインは新着（`published_at desc`）にフォールバックする
- **決定理由（2026-09-15）:** 幹A（気分起点の発見）を「おすすめ」の軸に据えることを先に固定したかったため。
  `like_count` / `bookmark_count` を使った人気度スコアは、`likes` / `post_bookmarks` テーブルが
  未実装で列が常に0のため現時点では書けない（落とし穴としては D19 と同じ「元テーブルが無い」系）
  - **前提条件の解消（2026-09-20）:** `likes`（PR #46）・`post_bookmarks`（feature/post-bookmarks）が
    揃い、列は実データを持つようになった。スコアリングアルゴリズム自体はこの時点でも未着手のまま
    （D24 の本体課題は「おすすめ＝新着」のまま）
- **影響（解消前）:** 興味タグを多く選んだユーザーほど「おすすめ」＝「新着」に近づく。逆に投稿数が少ない
  タグだけを選ぶと、おすすめが極端に薄くなる（フォールバックは「1件も無いとき」ではなく
  「タグ未設定のとき」にしか働かない）
- **対応案:** a) インタラクション実装後に人気度・鮮度・タグ一致の重み付けスコアへ差し替える
  b) 一致タグ数で並べる（PostgREST では書けないので DB 関数が要る）c) 現状維持
- **解消内容（2026-10-01、対応案b採用）:** 一致する興味タグ数が多い投稿を優先し、同数内は新着順にする方式へ変更。
  一致タグ数という集計値は PostgREST の `order()` では並べ替えられないため、DB関数
  `recommended_post_ranks`（security invoker、`status='published' and deleted_at is null` を明示 —
  `posts_select_own` の抜け穴対策）でランキングと keyset ページング（`match_count, published_at, id` の複合カーソル）
  を行い、返ってきた投稿ID集合を既存 `getPostList` に `postIds` フィルタとして渡して埋め込みデータを再取得する構成にした。
  S_HOME・S_EXPLORE・「もっと見る」（`app/_actions/feed.ts`）は新設の `getFeedPage`（`lib/posts/feed.ts`）を
  共有し、画面間で結果が食い違わないようにしている。like_count/bookmark_count を使う重み付け（対応案a）は、
  インタラクション量がまだ少ない段階では過剰設計と判断し見送った
  - `supabase/migrations/20261001131827_recommended_post_ranks.sql`
  - `lib/posts/recommended-feed.ts`
- 参照: S_HOME / S_EXPLORE 実装時に決定（2026-09-15）→ スコアリング実装（2026-10-01、PR #100）

### D25. S_EXPLORE の「近くのカフェ」サブタブが未実装 ✅ 解消済（2026-09-29）

- **課題:** ワイヤー（[wireframes/browsing.md](../design/wireframes/browsing.md) #S_EXPLORE）の
  サブタブは「おすすめ / 新着 / 近くのカフェ」の3つだが、実装したのは前2つ。
  「近くのカフェ」は Geolocation API + PostGIS の近傍検索 + カフェ一覧カードが前提で、
  `areas.center_location` の座標45件は投入済み（A3 解消済み・2026-09-26）だが、`S_MAP` / `S_CAFE_DETAIL` も未実装
- **判断（当時）:** 押しても何も出ないタブや404へのリンクを置くより、**タブごと出さない**ことを選んだ
- **解消内容:** `S_MAP`（#88）・`S_CAFE_DETAIL` の地図実装（#96）で前提が揃ったため実装。
  ワイヤーどおり投稿カードグリッドのままとし、既存の `getNearbyCafes`（`nearby_cafes` RPC）で
  取得したカフェID集合を `PostListOptions.cafeIds` で `getPostList` に渡す形にした
  （並び順は他タブと同じ `published_at desc, id desc` の keyset を維持。距離順への変更はしていない）。
  SSR初回描画は新宿駅フォールバック（`DEFAULT_MAP_CENTER`）→クライアントで現在地取得後
  `router.replace` で URL に反映、という `/map` と同じパターンを踏襲した
- **未解決:** `nearby_cafes` に半径カットオフが無い設計はそのまま（D63参照）。座標未収集のカフェが
  多いローカル/本番では「近くのカフェ」が実質空になりうる点は、バックフィル未実行（D63）の解消待ち
- 参照: S_EXPLORE 実装時にスコープ外と判断（2026-09-15）→ 地図・カフェ詳細地図の実装後に着手（2026-09-29）

### D26. 一覧のページ送りが「もっと見る」ボタンのみ ✅ 解消（2026-10-02）

- **課題:** フィードのページ送りは keyset カーソル（`published_at desc, id desc`）+
  「もっと見る」ボタンで実装した。無限スクロールではないため、ワイヤーの体験とは差がある
- **決定理由（2026-09-15）:** 無限スクロールは `/posts/[id]` から戻ったときのスクロール位置と
  読み込み済みページの復元が要り、今回のスコープが大きく膨らむ。クエリ側は最初から keyset に
  してあるので、UI だけ差し替えれば無限スクロールに移行できる
- **解消内容:** `PostFeed`（S_HOME/S_EXPLORE/S_MYPAGE/S_USER_PROFILE_PUBLIC/S_CAFE_DETAIL
  共有コンポーネント）を IntersectionObserver による自動読み込みに変更。読み込み済み一覧・
  カーソル・スクロール位置は `画面パス + クエリ` をキーに `sessionStorage` へ退避し、マウント時に
  復元する（対象5画面は全部 SSR で Router Cache に乗らず、`/posts/[id]` から戻るとコンポーネントが
  作り直されるため）。「もっと見る」ボタンは `sr-only focus-visible:not-sr-only` で視覚的には隠しつつ
  DOM には残し、キーボード操作者向けの代替トリガーとして維持した
- 参照: S_HOME / S_EXPLORE 実装時に決定（2026-09-15）→ 対応案bで実装（2026-10-02）

### D27. PC サイドナビ・補助カラムのリンク先が揃っていない 🟡 大部分解消（2026-09-26、地図・ボトムナビ追加）

- **課題:** ワイヤーの S_HOME（PC）は3カラムで、サイドナビに「地図 / 通知 / マイ / お気に入り /
  行きたい / 下書き / 設定」、補助カラムに「おすすめユーザー」が並ぶ。いずれもルート自体が未実装のため、
  実装したのは **ホーム / 発見 / 投稿する** の3項目と、補助カラムの「おすすめタグ」のみ
- **追記（2026-09-18）:** S_MYPAGE の実装に合わせて **「マイ」（`/me`）を追加**した（ログイン中のみ）。
  お気に入り・行きたい・下書きはマイページの4カードから辿れるので、サイドナビには重ねて置かない
- **追記（2026-09-18）: スマホの導線。** `HomeSideNav` は `hidden md:block` かつ `/` と `/explore` にしか
  出ないため、サイドナビだけだと**スマホから `/me` に辿り着けない**（メインターゲットの端末で
  マイページが発見できない）。共通ヘッダーの `AuthNav` にもログイン中のみ「マイページ」リンクを置いた。
  ボトムナビ自体はワイヤーにあるがまだ無いので、それが入ったらこのリンクは整理する
- **解消（2026-09-26、feat/s-map）:**
  - **サイドナビの「地図」** — `S_MAP`（`/map`）実装に合わせて `HomeSideNav` の `ITEMS` に追加。
    未ログインでも見られる画面のため `AUTHED_ITEMS` ではなく通常項目に置いた
  - **ボトムナビ** — `components/features/feed/bottom-nav.tsx` を新設し `(browsing)/layout.tsx` に組み込んだ。
    `md:hidden` でモバイルのみ表示、ログイン中は「ホーム/発見/投稿/地図/マイ」、未ログインは
    「ホーム/発見/地図/ログイン」（README.md #モバイル-ボトムナビ の仕様通り）
  - 上記の追加を受けて、`AuthNav` の「マイ」リンクは `hidden md:inline` に変更した。モバイルは
    ボトムナビの「マイ」でカバーされるため。md以上は `HomeSideNav` が無いページ
    （`/cafes/[id]` 等）向けの導線として残す
- **まだ出していないもの:** 共通ヘッダーの検索・通知アイコン、サイドナビの「通知/お気に入り/行きたい/
  下書き/設定」（マイページの4カードで代替済みのため優先度は低い）
- **追記（2026-09-23）:** S_SEARCH（`/search`）実装により、気分入り口の「もっと見る ▶」は
  `MoodEntry`（`components/features/feed/mood-entry.tsx`）に追加して解消した。共通ヘッダーの
  検索アイコンは今回は見送り（レイアウト全体に影響するため別スコープとする）
- **判断:** 404 になるリンクを先に置かない。ルートが増えるたびにサイドナビへ足す
- 参照: S_HOME 実装時にスコープ外と判断（2026-09-15）

### D28. S_USER_PROFILE_PUBLIC で「出していない」もの

- **課題:** ワイヤー（[wireframes/browsing.md](../design/wireframes/browsing.md) #S_USER_PROFILE_PUBLIC）に
  対して、実装したのは **ヘッダ（アバター・表示名・@username・bio）／投稿・フォロー・フォロワーの3カウント／
  フォローボタン／投稿グリッド** のみ
- **出していないものと理由:**
  - **解消済み（2026-09-23）:** **バッジ** — `user_badges` は 2026-09-23（S_BADGES 実装、PR #69/#71）に
    作成済みだった。ヘッダー直下・タブの上に横並びチップ（`EarnedBadgeRow`）で表示。0件のユーザーは
    行きつけタブと同じ判断で**行自体を出さない**。獲得済みだけを軽く読む
    `getUserEarnedBadges`（`lib/badges/earned.ts`）を新規に用意し、`/me/badges` 向けの重い集計
    （`getAllBadgeProgress`）は流用しない
  - **解消済み（2026-09-23）:** **「行きつけ」タブ** — `regular_customers` は 2026-09-23
    （S_OWNER_REGULARS 実装時）に作成済み。行きつけ表示UIを別PRで実装し、投稿/行きつけの2タブに
    した。行きつけが0件のユーザーは中身1枚しか無いので**タブ自体を出さない**（D25と同じ判断）。
    `routing.md` のツリーにあった `/users/[username]/posts` は作らず、ツリー側を訂正した
    （タブ切替はページ内で完結。`/cafes/[id]/posts` と同じ判断）
  - **「⋯」メニュー（通報 / ブロック / 非表示をまとめたもの）** — `reports` 作成に合わせて**通報する単独
    リンクだけ**は 2026-09-21 に出した（`BlockButton` と並べて配置）。ワイヤー通りの統合メニュー化は
    D47 に切り出し
  - **投稿カードのアクション行のうちコメント** — カードには返信UIを持ち込まない判断のため件数リンクも
    出していない（投稿詳細でのみ書ける）。**いいねは 2026-09-19、保存は 2026-09-20 に実装済み**
    （`likes` / `post_bookmarks` の作成に合わせて全画面のカードに出した）。
    中身が1つでも押せるものは出す方針なので、行そのものは出している
- **対応判断:** 各テーブルの実装時に戻る
- 参照: S_USER_PROFILE_PUBLIC 実装時にスコープ外と判断（2026-09-16）／いいね解消（2026-09-19）／保存解消（2026-09-20）／通報リンク解消（2026-09-21）／行きつけタブ解消（2026-09-23）／バッジ解消（2026-09-23）

### D29. 停止・削除・ブロック関係のプロフィールをすべて404にしている

- **課題:** `profiles_select_all` は `using (true)` で、`status` もブロック関係も RLS では絞られない。
  アプリ層で `status='active'` 以外と `is_blocked_either_way()` が真の相手を `notFound()` に落とした
- **決定理由（2026-09-16）:** 投稿詳細の404と同じく「その行が存在すること」自体を漏らさないため。
  ブロックは向きを区別せず404にすることで、`blocks_select_own`（ブロックされた側に気づかれるのを
  避ける）の方針を壊さずに済む
- **影響:** 1) `posts_select` は作者の `status` を見ないため、**停止・削除済みユーザーの公開投稿は
  フィードと投稿詳細に残り続ける**（プロフィールだけが404になる）。2) 投稿カードの作者リンクは
  404 になりうるが、リンク先を事前に判定するとカードごとに往復が増えるため許容する。
  3) `follows_insert_own` の `status='active'` 判定も INSERT 時だけなので、フォロー後に相手が
  停止・削除されても `follows` 行は残り、`getProfileCounts` のフォロー数・フォロワー数に
  数え続ける（ブロックは 20260916120100 のトリガで時間方向も手当て済みだが、status 遷移は非対称）
- **対応案（未検討）:** a) `posts_select` に作者の `status='active'` 条件を足すマイグレーション
  b) 停止時に投稿を一括 `archived` にする運用 c) 現状維持
  d) `profiles.status` が active から外れたら `follows` を両方向とも切るトリガー（b とセットが自然）
- **既知の狭いレース（許容）:** read committed では「`follows` INSERT のポリシー評価」と
  「`blocks` INSERT + トリガーの delete」が交差したとき、双方が相手の未コミット行を見ないため
  ブロック済みペアに `follows` 行が1件残りうる。次のブロック/解除まで自己修復しない
- 参照: S_USER_PROFILE_PUBLIC 実装時に決定（2026-09-16）

### D30. S_CAFE_DETAIL で「出していない」もの

- **課題:** ワイヤー（[wireframes/browsing.md](../design/wireframes/browsing.md) #S_CAFE_DETAIL）に
  対して、実装したのは **ヒーロー画像／カフェ名・エリア・投稿件数／営業時間表／「今営業中」バッジ／
  現在の混雑度（3段階フォールバック）と報告フォーム／住所・電話・Web／投稿グリッド** のみ
- **解消済み（2026-09-18）:** **「行きたい」「お気に入り」** は `user_cafe_lists` の作成に合わせて実装した
  （`components/features/cafes/cafe-list-buttons.tsx`）
- **出していないものと理由:**
  - **解消済み（2026-09-28）:** **地図・「徒歩3分」** — 既存カフェの `cafes.location` バックフィル
    （D63、2026-09-27）で座標未収集の問題が解消されたのを受けて実装した。
    `cafe_lat`/`cafe_lng`（PostgREST computed column）で `location` の WKB hex 問題を回避し
    `getCafeDetail` に緯度経度を追加。PCは右カラムに地図を常時表示、モバイルはワイヤーの
    「地図で見る」ボタンを `/map` への遷移ではなくその場の開閉にした（
    [browsing.md #S_CAFE_DETAIL](../design/wireframes/browsing.md#s_cafe_detailカフェ詳細) 注記参照）。
    徒歩分数はクライアント側 haversine 距離 × `estimateWalkMinutes` の概算（GPS拒否・非対応時は
    表示自体を出さない、`/map` と同じ失敗許容パターン）
    （`components/features/cafes/cafe-detail-map.tsx` `cafe-map-section.tsx` `walking-time-badge.tsx`）
  - **解消済み（2026-09-22）:** **「オーナーから」セクション** — S_POST_OFFICIAL 実装に合わせて
    `components/features/cafes/owner-posts-section.tsx` で実装した。直近3件のみ表示で、
    専用の「もっと見る」ページングは持たない（S_CAFE_DETAIL に専用ルートが無いため）
  - **「投稿 / 基本情報」タブ** — 中身が実質1枚なので**タブ自体を出さない**（D25・D28 と同じ判断）。
    `routing.md` のツリーにあった `/cafes/[id]/posts` も同じ理由で作らず、ツリー側を訂正した
  - **「時間帯別の混雑傾向」ヒートマップ** — `get_cafe_congestion_current()` は「今」の1点しか返さず、
    曜日×時間帯の集計には Postgres 関数の新規追加が要る。報告データが実質ゼロの状態で
    枠だけ出しても読み取れる情報が無いため見送り
  - **「⋯」メニューの通報** — 単独リンクは 2026-09-21 に出した（D28 と同じ判断・D47 参照）。
    完了画面の「ブロックしますか？」はカフェには対象ユーザーが無いため出していない（D47）
  - **投稿カードのアクション行のうち コメント / 保存** — S_HOME・S_POST_DETAIL・
    S_USER_PROFILE_PUBLIC と同じ判断（**いいねは 2026-09-19 に実装済み**）
- **対応判断:** 各テーブル・幹C の実装時に戻る
- 参照: S_CAFE_DETAIL 実装時にスコープ外と判断（2026-09-17）／いいねのみ解消（2026-09-19）／通報リンク解消（2026-09-21）／
  地図・徒歩3分解消（2026-09-28）

### D31. カフェのヒーロー画像が最新投稿へのフォールバックだけで成り立っている

- **課題:** `cafes.main_image_path` は「Supabase Storage の `cafe-images` オブジェクトパス」と
  定義されている（[tables.md](../architecture/data-model/tables.md) #cafes）が、**`cafe-images`
  バケットは存在せず**（実在するのは `post-images` のみ）、オーナーのアップロード導線も未実装。
  そのため S_CAFE_DETAIL のヒーロー画像と OG 画像は、実質つねに
  「そのカフェの最新投稿の1枚目」フォールバック（tables.md:209）で描かれている
- **決定理由（2026-09-17）:** 書き込み導線（幹C のオーナー管理画面）が無い以上、いま
  バケットだけ作っても空のまま。マイグレーションを増やさずフォールバック側だけ実装した
- **影響:** 投稿が0件のカフェはヒーロー画像が常にプレースホルダになる。また `main_image_path` に
  値が入る経路が現状 service role / 直接接続しかない
- **対応案（未検討）:** a) 幹C のオーナー管理画面と同時に `cafe-images` バケット＋RLS を作る
  b) admin だけが設定できる暫定導線を先に作る
- **注意:** 値が入ったときも表示前に必ず `isStoragePublicUrl`（`lib/storage/public-url.ts`）を通すこと。
  `avatar_url` と同じく、列そのものは信頼できない
- **2026-09-23 追記:** S_OWNER_CAFE_EDIT 実装時にバケット新設を見送った（PRの見積もりが
  約2倍に膨らむため。S_CAFE_NEW が地図・郵便番号自動入力を見送ったのと同じ判断）。
  基本情報・外部連携・営業時間のみ編集可能にし、メイン画像アップロードは引き続き未解消のまま次に送る

### D32. S_MYPAGE と一覧3画面で「出していない」もの

- **課題:** ワイヤー（[wireframes/mypage.md](../design/wireframes/mypage.md) #S_MYPAGE）に対して、
  実装したのは **ヘッダ（アバター・表示名・@username・bio・3カウント）／4枚のショートカットカード
  （お気に入り・行きたい・下書き・保存）／タブ切替プレビュー（同4レーンの直近5件）／自分の投稿グリッド** と、
  `/me/favorites` `/me/want-to-go` `/me/drafts` `/me/bookmarks` の4画面
  （`post_bookmarks` 実装により「保存」カードと `/me/bookmarks` は復活済み — feature/post-bookmarks）
- **出していないものと理由:**
  - **バッジ枠・「制覇マップを見る」・`/me/badges`** — `/me/badges`（S_BADGES）は実装済み
    （feature/badges-ui）。マイページ本体には件数プレビューは出さず、ボタン1つの導線のみ
    （4枚のショートカットカードは決定済みの構成のため増やさない）
  - **解消済み（2026-09-23）:** **「私の行きつけ」枠** — `regular_customers` の表示UIを実装。
    ヘッダ直下・4枚のショートカットカードの前にプレビュー（最新3件）を置き、`/me/regulars`
    （ページ送りなし、`REGULAR_CAFE_LIST_LIMIT`=100件で打ち切り）への「すべて見る」導線を追加した。
    件数が0でもプレビュー枠自体は出す（4枚のショートカットカードと同じ判断。D25・D28・D30の
    「タブ自体を隠す」はタブ切替に対する判断で、この枠はタブではないため対象外）
  - **アバター差し替え** — `/me/edit`（表示名・bio・ホームエリア編集）は実装済み（feature/profile-edit）。
    アバター変更は当初 Storage 導線が別途必要なため未実装だったが、D45で解消済み（2026-10-03）
  - **カフェカードのサムネイルと「投稿12」** — どちらもカフェ1件ごとに追加の問い合わせが要り
    N+1 になる（`cafes.main_image_path` は D31 のとおり値が入る経路が無く、投稿件数は
    PostgREST では1クエリにまとめられない）。カード表示は名前・エリア・メモ・追加日のみ
  - **一覧の「並び順」「表示: リスト/グリッド」切替と PC 右カラムの地図** — 並びは `created_at desc` 固定。
    地図は `S_MAP` 未実装のため（A3 の座標自体は解消済み・2026-09-26）
  - **ページ送り** — 一覧は `CAFE_LIST_LIMIT`（100件）で打ち切る。keyset ページングは
    件数が問題になってから（フィードの「もっと見る」と同じ方式に寄せる）。
    見出しの件数は `getUserCafeListCounts`（打ち切られない正確な値）を出し、
    表示件数がそれに満たないときは「100件までを表示しています」と明示する
    （`entries.length` を件数に使うと、4カードの「137」と一覧の「100件」が黙ってズレる）
  - **メモ（`user_cafe_lists.note`）の編集導線** — `user_cafe_lists` に UPDATE ポリシーを置いていないため、
    値は INSERT 時しか入らない。表示だけ実装済み（`note` があればカードに出る）。
    編集を出すときは UPDATE ポリシーの追加が先
  - **「追加: 2週間前」の相対表記** — 絶対日付（`formatPostDate`）で出している。相対表記は
    サーバー描画とクライアントで基準時刻がずれるため、専用のユーティリティを用意してから
- **決定理由（2026-09-18）:** 404 になるリンク・押せない枠を先に置かない（D27）。
  タブ切替プレビューは実の伴うレーンが3つあるので出した（1枚しか無ければ出さない — D25・D28・D30）
- **対応判断:** 各テーブル・ルートの実装時に戻る
- 参照: S_MYPAGE 実装時にスコープ外と判断（2026-09-18）／私の行きつけ枠解消（2026-09-23）

### D33. ～~送信中に `disabled` にするボタンがフォーカスを失う~~（解消）

- **課題（起票時）:** 楽観更新するボタンを送信中 `disabled={isPending}` にすると、無効化された瞬間に
  フォーカスが `<body>` に落ちる。キーボード／スクリーンリーダーのユーザーは、1回押すたびに
  ページ先頭から辿り直すことになる（WCAG 2.4.3 の観点で実害がある）
- **解消（2026-09-23）:** 残っていた4コンポーネント（`CongestionSection` / `FollowButton` /
  `DraftList` / `CafeListView`）すべてで `disabled` をやめ、`aria-busy={isPending}` +
  ハンドラ冒頭の `if (isPending) return` ガードに揃えた。`CafeListButtons` / `LikeButton` と
  同じ方式（対応案 a）。共通ラッパー化（案b）は見送り — 4件とも文脈が違う
  （生button / `<Button>` / ダイアログ内 / 一覧内で `isPending` 共有）ため、無理に共通化しない
- **FollowButton は追加で `key` remount も解消した:**
  `app/(browsing)/users/[username]/page.tsx` の `FollowButton` に付けていた
  `key={`${profile.id}:${following}`}` を削除した。フォロー成功後の `router.refresh()` で
  `following` が変わるたびにコンポーネントごと作り直され、`aria-busy` に置き換えても
  remount 自体でフォーカスが落ちる別種の原因だったため。副作用として、別タブでのフォロー
  解除など外部要因による `initialFollowing` のズレは次のページ遷移まで反映されなくなるが、
  同一セッション内の自己操作は楽観更新でカバーされるため実害は小さいと判断
  （検証: 実ブラウザで対象ユーザーをフォロー→ `router.refresh()` 完了後もボタンに
  フォーカスが残ることを確認済み）
- **DraftList の削除確認ダイアログ（:148）は実機確認が未完了のまま:** ローカルの下書き作成
  フローが今回のセッションでは動かず（既存の不具合の可能性、D33のスコープ外につき未調査）、
  Radix Dialog の FocusScope との相互作用は単体テストでのみ確認した
  （他の下書きの「削除」ボタンが無効化されず `aria-busy` になることは実ブラウザ不要でテスト済み）
- D37（`refresh()` が `startTransition` の中）は今回のスコープ外のまま。関連性は D37 側参照
- 参照: S_MYPAGE 実装のレビューで判明（2026-09-18）／対象の数え漏れを訂正（2026-09-19）／
  残り4件を解消（2026-09-23）

### D34. 実機（ブラウザ）で一度も確認していない画面が残っている

- **課題:** PR #37（S_CAFE_DETAIL）以降は Playwright MCP での実機確認が定着し、PR #42 で
  「確認した内容を E2E spec に残す」仕組みも入った。**それ以前の PR #29〜#34 で実装した画面は
  実ブラウザで一度も触られていない。** PRテンプレートの「該当する画面で操作確認」も
  #29 / #30 / #32 / #33 / #34 はすべて未チェックのままマージされている
- **状況の整理（2026-09-19 時点）:**

| 画面 | 実装PR | 実機確認 | E2E |
|---|---|---|---|
| `/new` `/new/short` `/new/blog` `/new/success`（composer） | #29 / #30 | ❌ | ❌ |
| `/posts/[id]`（S_POST_DETAIL） | #32 | △ いいね導線のみ（2026-09-19） | △ `likes.spec.ts` がいいね導線のみ |
| `/`（S_HOME） | #33 | △ カード表示のみ（2026-09-19） | △ `smoke.spec.ts` が h1 と title を見るだけ |
| `/explore`（S_EXPLORE） | #33 | △ カードのいいねのみ（2026-09-19） | ❌ |
| `/users/[username]`（S_USER_PROFILE_PUBLIC） | #34 | △ カード表示のみ（2026-09-19） | △ 同上（カードのいいね表示のみ） |
| `/signup/*` `/onboarding/*` | 初期 | ❌ | ✅ `signup-onboarding.spec.ts` が4ブラウザで完走 |
| `/cafes/[id]`（S_CAFE_DETAIL） | #37 | ✅ | ✅ `cafe-list-toggle.spec.ts` |
| `/me`（S_MYPAGE） | #39 | ✅ | ✅ 同上 |
| `/me/favorites` `/me/want-to-go` `/me/drafts` | #39 | 記録なし | ❌ |

- **とくに危ないもの — composer の画像処理と自動保存:**
  ロジック自体はユニット/コンポーネントテストで厚く覆われている
  （`lib/storage/post-image-processing.test.ts` が縮小・品質段階的低下・`FILE_TOO_LARGE` /
  `UNSUPPORTED_MEDIA_TYPE` を、`use-composer.test.tsx` が15秒デバウンス・再試行・
  二重送信を、いずれもエンコーダとタイマーを差し替えて検証している）。
  **覆われていないのは「実ブラウザでしか起きないこと」**:
  - `<canvas>` の `toBlob('image/webp')` が実際に WebP を返すか（**Safari の判断材料そのもの**。
    PNG が返る経路は `UNSUPPORTED_MEDIA_TYPE` として設計済みだが、実機で踏んだことがない）
  - **GPS 付きの実 JPEG を通したとき EXIF が実際に落ちるか**（A10 のクライアント信頼問題と対）
  - 15秒の実時間デバウンスと「自動保存済み ・ ○秒前」表示
  - 署名付きURLへの直PUT が実際に成功し、投稿詳細に画像が出るところまでの通し
- **影響:** 動かない可能性が高いという話ではない（CI のユニット308件・統合・型はすべて green）。
  **壊れていても気づく手段が無い**のが問題で、次に誰かが composer に触ったとき初めて露見する
- **対応案（未検討）:** a) 画面ごとに実機確認 → 1〜2本ずつ E2E に落とす（`/test` の方針どおり。
  composer → 投稿詳細 → S_HOME の順が、投稿を作らないと後続を確認できないため自然）
  b) composer だけ先に潰す（実機でしか確認できない項目が集中しているため）
  c) 現状維持（新規実装を優先し、触るときに一緒に確認する）
- **追記（2026-09-19、likes 実装時）:** いいねボタンを `/`・`/explore`・`/posts/[id]`・
  `/users/[username]`・`/cafes/[id]` に追加し、**5画面すべてを Playwright MCP で実機確認した**。
  ただし確認したのは**いいね導線と、その周辺が崩れていないことだけ**。各画面の本来の機能
  （composer からの投稿、気分チップの絞り込み、フォロー、ページ送り等）は依然として未確認なので、
  表の判定は ✅ ではなく △ に留めている
- **実機確認で分かったこと（2026-09-19）:**
  - 未ログイン → いいね押下 → ログイン → `next` で元の投稿へ復帰、まで通る
  - 他人の投稿へのいいねで件数が 1→2 に増える（`security definer` の経路を実ブラウザで確認）
  - **クリック後もフォーカスがボタンに残る**（`disabled` を避けた D33 の狙いどおり。
    アクセシビリティスナップショットで `[active]` が維持されていることを確認）
  - live region に「いいねしました」「いいねを外しました」が入る
  - 390px 幅でカードが1列に積まれ、崩れない。いいね済みは色だけでなくラベルと
    ハートの塗りでも区別できる
  - **未いいねの投稿が一覧に残る**（`!inner` を付けていたら消えていた箇所を目視でも確認）
  - コンソールのエラー・警告は0件
- **残る未確認（今回触れていない）:** composer の EXIF 除去・WebP 変換（A10 / Safari 判断の材料）、
  15秒デバウンスの自動保存、署名付きURL直PUT。**対応案 b（composer を先に潰す）の優先度は
  変わらず高い** — 実機でしか確認できない項目がそこに集中している
- 参照: PR #42 で実機確認をE2Eに残す仕組みを入れた際に、過去分が未処理であることが判明（2026-09-19）

### D35. ～~いいねの返報性通知が作れない（`notifications` 未作成）~~（解消）

- **解消（2026-09-20）:** `notifications` テーブルと like/comment/follow の3トリガーを実装した
  （`20260920150000_create_notifications.sql` / `20260920160000_notify_on_comment_payload_post_id.sql`）。
  S_NOTIFICATIONS 画面（一覧・フィルタタブ・既読化・フォローバック）も実装済み。
  `user_settings.notify_like/comment/follow` は既に参照先を持つ
- **残課題:** `badge` / `owner_verified` / `regular_awarded` / `official_post` / `report_resolved` の
  5種は CHECK 制約に型だけ確保し、発火元（バッジ付与・オーナー認証・常連認定・公式投稿・通報解決）
  が未実装のためトリガーは無い。それぞれの機能実装時に発火元トリガーを追加する
- 参照: 通知機能実装時にlikes/comments/followsとまとめて着手（2026-09-20）

### D36. `follows` の SELECT がブロックを反映していない（likes と判断が揃っていない）

- **課題:** `likes` の SELECT には `not is_blocked_either_way(user_id)` を入れたが、
  `follows_select_all` は `using (true)` のまま（`20260905130300`）。
  `follower_id` で絞れば**その人が誰をフォローしているかは誰でも列挙できる**。
  露出の種類としては「いいねした投稿の列挙」と同じで、likes だけ締めた状態になっている
- **ただし穴の大きさは違う:**
  - フォロー数・フォロワー数は**ワイヤーで公開表示される設計**
    （[wireframes/browsing.md](../design/wireframes/browsing.md) #S_USER_PROFILE_PUBLIC）。
    likes には「いいねした人の一覧」画面が無く、公開する設計意図が無い
  - ブロック相手との行は `delete_follows_on_block`（`20260916120100`）が両方向とも消すので、
    **ブロックした相手との関係は follows に残らない**。漏れるのは「その人の他のフォロー先」
- **判断が要る点:** フォロワー一覧画面（未実装）を作るときに、ブロック相手を一覧から
  外すのか、`follows` の RLS 側で締めるのか。RLS で締めるとフォロー数がブロックの有無で
  閲覧者ごとに変わり、`likes` で「`like_count` は閲覧者によって変えない」とした判断と
  ぶつかる（[tables.md #likes](../architecture/data-model/tables.md)）
- **対応判断:** フォロワー一覧（S_USER_PROFILE_PUBLIC のタブ）実装時に決める。
  それまでは現状維持。決めた内容は `tables.md #follows` に書く
- 参照: `likes` の SELECT にブロックを反映した際、`follows` と揃っていないことが判明（2026-09-19）

### D37. `router.refresh()` を `startTransition` の中で呼んでいる

- **課題:** 楽観更新するコンポーネントが、Server Action の完了後に同じ
  `startTransition` の中で `router.refresh()` を呼んでいる。`refresh()` は
  トランザクションに参加するため、**`isPending` が RSC の往復が終わるまで真のまま**になる。
  その間、押下は `if (isPending) return` ガード（または `disabled`）に黙って捨てられる
- **対象（2026-09-19 実測）:** `startTransition` の中で `refresh()` を呼ぶのは6コンポーネント。
  `LikeButton` / `CafeListButtons` / `FollowButton` / `CongestionSection` / `DraftList` /
  `CafeListView`（`login-form.tsx` も `refresh()` を呼ぶが `startTransition` の外なので対象外）
- **2つの症状が重なっている:**
  1. **押下が捨てられる時間が長い。** `aria-busy` に置き換えた側（`LikeButton` /
     `CafeListButtons`）は視覚的な待機表示が無いので、ユーザーには「反応しない」としか映らない。
     実機では短い無反応を確認した（ローカルのデータ量では軽微）
  2. **`LikeButton` では refresh の結果が必ず捨てられる。** `PostFeed` は
     `useState(initialPage.items)` で一覧を抱え、`LikeButton` も props から state を
     1度しか初期化しない。サーバーの再描画コストを払って結果を捨てている
     （投稿詳細でも同じ。件数のズレは Server Action の戻り値で直す設計にした）
- **未確認:** 他の5コンポーネントで `refresh()` の結果が実際に使われているかは個別に見ていない。
  `CongestionSection` のように「サーバー側の集計値を読み直す」ものは必要な可能性がある
- **対応案:** a) `refresh()` を `startTransition` の外に出す（`isPending` が書き込みの完了で
  終わる。最小の差分） b) 結果を使っていないコンポーネントでは `refresh()` 自体をやめる
  c) 待機表示を足して「反応しない」に見えないようにする
- **注意:** `refresh()` を外に出すと E2E の `waitIdle`（`aria-busy` が false に戻るのを待つ）が
  書き込み完了だけを待つようになる。`cafe-list-toggle.spec.ts` / `likes.spec.ts` の
  リロード前の待機が足りるかは直すときに確認が要る
- 参照: `likes` 実装後の `/code-review` で指摘され、実機確認でも再現（2026-09-19）

### D38. `likes_select_all` が投稿の可視性を継承していない ✅ 解消済（2026-09-23）

- **対応済み:** `20260923150000_likes_select_visibility.sql` で
  `comments_select_visible`（[docs/architecture/data-model/tables.md#likes](../architecture/data-model/tables.md#likes)）
  と同じパターンを横展開した。`exists (select 1 from posts p where p.id = likes.post_id)
  or is_post_author(likes.post_id)` を既存の `not is_blocked_either_way` と AND 結合。
- **副作用の修正も同時に対応:** 可視性継承により `lib/badges/rules.ts` の
  `countLikesGiven`（RLSバインドの通常クライアント）が、いいねした投稿が後で
  非公開になった場合に過小評価になる問題（`count_likes_received` で一度発生した問題と同型）
  が新たに生じるため、`count_likes_given` RPC（`security definer`）を新設して切り替えた。
  さらに `/code-review` の指摘で、権威ある判定 `badge_criteria_met` の `likes_given` 分岐が
  無絞り込みの `count(*)` のままだと lib 側の事前フィルタと食い違う（`checkAndAwardBadges`
  が false を返して `award_badge` へ辿り着けなくなる）ことが判明し、`likes_received` 分岐と
  同じく `count_likes_given` を呼ぶよう `badge_criteria_met` も同マイグレーションで更新した。
- テスト: `tests/integration/likes.test.ts` の `RLS（投稿の可視性継承・D38）` /
  `countLikesGiven（RPCでRLSをバイパスする集計）`、
  `tests/integration/badges-check.test.ts` の `likes_given: フォロワー限定投稿へのいいねも...`
- 参照: `comments` 実装の引き継ぎ調査で発見（2026-09-20）

### D39. コメントUI（comment-list / comment-form）が実機未確認のまま

- **課題:** S_POST_DETAIL に埋め込んだコメントスレッド（`comment-list.tsx` /
  `comment-form.tsx`）はコンポーネントテスト（22件、モック経由）と DB/BE の統合テストで
  検証したのみで、ブラウザでの実機確認ができていない。ローカルDBに公開済み投稿が
  無く、ログイン済みセッションを用意する手間が実装セッション内で見送られた
- **未確認の観点:** 返信フォームの展開・折りたたみのフォーカス移動、削除確認の
  インライン表示のレイアウト崩れ、`is_official` バッジの表示、モバイル/タブレット/PC
  3レイアウトでの崩れ、`もっと見る` の実データでの動作
- **対応:** D34 と同様、実機確認をまとめて行うタイミングでこのコンポーネントも含める
- 参照: `comments` FE実装セッション（2026-09-20）

### D40. 新規登録したカフェが登録直後から全ユーザーに公開される

- **課題:** `cafes_select_active_anon` / `_authenticated` は `status='active'` のみを見ており、
  「レビュー待ち」のような中間状態が無い。S_CAFE_NEW で登録したカフェは保存した瞬間から
  誰にでも見える。誤登録・いたずら登録への対処手段が無い
- **決定（v1）:** 許容する。`reports`（通報）テーブル自体がまだ存在しない状態で、カフェだけの
  モデレーション導線を先に作るのは本末転倒なため、通報機能実装時にまとめて対処する
- **対応案（未検討）:** a) `status` に `pending_review` 等の中間状態を追加し admin 承認を要求する
  b) 通報機能実装時に、閾値超えで `hidden` へ自動遷移させる c) 現状維持
- 参照: S_CAFE_NEW 実装時の決定（2026-09-20）

### D41. `font_scale`（文字サイズ設定）が保存されるだけで表示に反映されない

- **課題:** S_SETTINGS の「文字サイズ」は `user_settings.font_scale` に保存されるが、
  実際のフォントサイズへ反映する仕組み（`<html>` へのクラス付与・CSS変数切り替え等）は無い。
  選択しても見た目は変わらない
- **決定（v1）:** 反映の仕組みは今回のスコープに含めない。`notify_email`（B7）と同じ
  「機能より先に列を置く」既定パターンとして扱う。ルートレイアウトを触る変更でスコープが
  跳ねるため、反映は別途着手する
- 参照: S_SETTINGS 実装時の決定（2026-09-20）

### D42. `user_settings_update_own` に `is_active_user()` ガードが無い

- **課題:** `user_settings_update_own`（`20260905130100_create_user_settings.sql`）は
  `auth.uid() = user_id` のみで、suspended / pending_consent でも自分の設定を更新できる。
  CLAUDE.md の「RLSに認可を委譲」原則との厳密な整合では未決事項として残る
- **決定（v1）:** ガードを追加しない。`user_settings` の6列（通知3種・位置情報・おすすめ活用・
  文字サイズ）はすべて自分にしか効かず、他ユーザーの行やリソースに一切波及しない。
  RLSに認可を委譲する原則は「他者への影響をポリシー側で塞ぐ」ためのものであり、
  影響範囲が自分の行1件に閉じるこのテーブルでは、凍結中の更新を許しても攻撃面が増えない
  （D13の「凍結中でも自衛手段は残す」とは理由が異なる — あちらは他者に対する防御操作、
  こちらは単に無害だから、という個別の判断）
- 参照: S_SETTINGS 実装時の決定（2026-09-20）

### D43. 通知の個別既読化が fire-and-forget でロールバックが無い

- **課題:** `NotificationList.handleMarkRead`（`components/features/notifications/notification-list.tsx`）は
  `void markNotificationAsRead(...)` として結果を見ず、失敗してもローカルの `readAt` を戻さない。
  `BookmarkButton` / `LikeButton` は同じ楽観更新パターンで必ず失敗時ロールバック + エラー表示を
  しており、ここだけ一貫していない（`void` で結果を捨てる Server Action 呼び出しの前例は
  `use-composer.ts` の `useEffect` 内1箇所のみで、書き込み系では無い）
- **実害:** 小さい。対象行の UPDATE は RLS に守られておりほぼ失敗しないが、ネットワーク瞬断時に
  「未読チップは消えたのに DB は未読のまま」という食い違いがリロードまで残りうる
- **対応案（未検討）:** 失敗時だけ該当 item の `readAt` を `null` に戻す、または控えめな
  `role="alert"` 表示を追加する
- 参照: S_NOTIFICATIONS 実装後の `/self-review`（2026-09-20）

### D44. 通知一覧の相対時刻表示がハイドレーションミスマッチのリスクを持つ

- **課題:** `NotificationItem`（`components/features/notifications/notification-item.tsx`）は
  `'use client'` だが SSR される。`formatRelativeTime(item.createdAt)` は引数無しで `new Date()` を
  使うため、サーバー描画時とクライアント hydrate 時で計算結果が変わりうる。特に作成直後・
  1分未満の通知は秒単位で表示が変わるため、通知を作成直後にそのまま見るケース（本来の主用途）で
  踏みやすい
- **実機確認時の状況:** 手元の確認ではタイムラグが大きく再現しなかったが、理論上のリスクは残る
- **対応案（未検討）:** `useEffect` でマウント後にのみ相対時刻を計算する（初期表示は
  `formatPostDate` 等の安定表示、またはプレースホルダ）。もしくは `<time>` に
  `suppressHydrationWarning` を付ける
- 参照: S_NOTIFICATIONS 実装後の `/self-review`（2026-09-20）

### D45. アバター差し替え（S_PROFILE_EDIT）が未実装 ✅ 解消済み（2026-10-03）

- **課題（経緯）:** `/me/edit` で表示名・bio・ホームエリアは編集できるが、アバター画像の変更導線が無かった。
  設計自体は [data-model/README.md](../architecture/data-model/README.md) にバケット構成
  （`avatars/{user_id}/{uuid}.webp`、2MB上限、public）として記載済みだった
- **対応内容:**
  - `20261003120000_create_avatars_storage.sql` で `avatars` バケット＋RLS（`post-images` と同型）を追加
  - `lib/storage/post-image-processing.ts` の `processPostImage` / `encodeWithinLimit` を
    `ProcessImageOptions`（`maxEdgePx` / `maxBytes` / `qualities`）で引数化し、デフォルト値は
    post用の現状値のまま維持。avatar用の薄いラッパー `lib/storage/avatar-image-processing.ts`
    （長辺512px・2MB上限）から呼ぶ。着手前のメモでは「そのまま流用できる」としていたが、
    実際には上限値がモジュールトップレベルの定数で固定されており引数化が必要だった
  - `lib/storage/post-image-verify.ts` の `verifyNoGpsExif` にも `bucket` 引数（デフォルト
    `post-images`）を追加し、`lib/storage/avatars.ts` 経由でアバターにも A10 と同じ
    サーバー側GPS再検証を適用（owner-documentsと違い、アバターは個人の写真という性質上対象に含めた）
  - `app/api/uploads/avatar/sign/route.ts`・`lib/validators/uploads.ts` の
    `avatarUploadSignSchema`・`lib/storage/avatar-client.ts`（`uploadAvatar`）を owner-document
    と同型で追加
  - `app/_actions/profiles.ts` の `updateProfile` に `avatarUrl` を追加。DB更新成功後に
    `lib/storage/public-url.ts` の `storagePathFromPublicUrl` で旧パスを逆算し、
    `deleteAvatarFile` で削除する（D3対応案c）。削除失敗はログのみで更新自体は成功扱い
  - アバター削除（「未設定に戻す」）はワイヤー（[mypage.md](../design/wireframes/mypage.md)
    #S_PROFILE_EDIT）に記載が無いためスコープ外のまま据え置き
- 参照: S_PROFILE_EDIT 実装時の着手判断（2026-09-21）・実装（2026-10-03）

### D46. `profiles.username` の「変更不可」が RLS/トリガーで守られていない（解消済み・2026-09-23）

- **課題:** `guard_privileged_profile_columns`（`20260905130000_create_profiles.sql`）は
  `role` / `status` の変更だけを弾く。`username` はガード対象外のため、`profiles_update_self`
  ポリシー（`auth.uid() = id`）さえ満たせば PostgREST 経由で誰でも自分の `username` を直接書き換えられる。
  S_PROFILE_EDIT の「ユーザーネームは変更できません」は `app/_actions/profiles.ts` の
  `profileEditSchema` に `username` を含めないことでしか担保していない
  — CLAUDE.md の「RLSに認可を委譲」からは外れた状態
- **対応内容:** `20260923140000_guard_profile_username.sql` で `guard_privileged_profile_columns` に
  `username` の変更検知を追加（`role`/`status` と同じ RAISE EXCEPTION 方式）。
  **admin 例外は設けない** — ワイヤー（[mypage.md](../design/wireframes/mypage.md)）に例外の記述が無く、
  管理画面にも username 変更UIが存在しないため。将来モデレーション目的で強制変更が必要になれば、
  その時に専用の Server Action + `is_admin()` チェックとして別途設計する
  （RLS層で先回りして使われない権限を開けない判断）
- `tests/integration/profiles-rls.test.ts` の該当テストを「守られていない」から
  「本人・admin ともに変更不可」を検証する形に反転済み
- 参照: S_PROFILE_EDIT の `/code-review`（2026-09-21）

### D47. S_REPORT_FORM で見送ったもの

- **課題:** ワイヤー（[wireframes/composer.md](../design/wireframes/composer.md) #S_REPORT_FORM）と
  `reports` テーブル設計（[tables.md](../architecture/data-model/tables.md) #reports）に対して、
  実装したのは **理由選択・補足説明・送信・完了画面（ブロック提案含む）と、投稿詳細／カフェ詳細／
  公開プロフィールへの単独「通報する」リンク** のみ
- **見送ったものと理由:**
  - **自己通報の CHECK 制約は `target_type='user'` のみ** — `reports_no_self_report`
    （`20260921000000_create_reports.sql`）は `reporter_id = target_id` の単純比較で足りる user のみを
    弾く。post/comment の「自分の投稿/コメントを自分で通報」を防ぐには `posts.author_id` /
    `comments.author_id` のルックアップが要り、`notify_on_*` 系トリガーと同等の複雑さになるため見送った。
    cafe に「自分自身」の概念はそもそも無い。実害は薄い（モデレーションの手間が増えるだけ）と判断
  - **統合「⋯」メニュー（通報・ブロック・非表示をまとめたもの）** — `block-button.tsx` の前例
    （単独ボタン）を踏襲し、3画面に「通報する」単独リンクを足すだけに留めた。非表示機能自体が未実装
  - **カフェ通報のブロック提案は常に出ない** — 完了画面の「該当ユーザーをブロックしますか？」は
    `createReport` が返す `blockableUserId` に基づくが、`getCafeDetail`（`lib/cafes/cafe-detail.ts`）は
    `verified_owner_id` を公開列に含めていないため、`target_type='cafe'` は常に `blockableUserId: null`
    になる。オーナーをブロックする導線を出すべきかは未検討のまま
- **対応判断:** 通報が実運用でどう使われるか（自己通報の実害・非表示ニーズの有無）を見てから着手する
- 参照: S_REPORT_FORM 実装時にスコープ外と判断（2026-09-21）

### D48. S_ADMIN_REPORTS / S_ADMIN_REVIEW で見送ったもの

- **課題:** ワイヤーフレームが存在せず（37画面インデックスに `S_ADMIN_*` は無い）、根拠は
  [screen-flow.md](../design/screen-flow.md#5-通報ブロックフロー) の Mermaid フローと
  [routing.md](../architecture/routing.md) のルート定義のみ。画面要素は実装時に判断した
- **判定アクションは post/comment/user の3種＋却下のみ** — `target_type='cafe'` は却下しか選べない。
  cafe への具体的な対応（`verified_owner_id` の停止・カフェの非公開化等）は未設計のまま
- **audit_logs の INSERT は admin の Server Action から直接書き込む方式** — `docs/architecture/
  data-model/tables.md` は元々「INSERT はシステム」とだけ書いていたが、security definer 関数を
  介さず `actor_id = auth.uid()` を RLS で強制する形にした（[tables.md #audit_logs](
  ../architecture/data-model/tables.md#audit_logs)）
- **通知は通報者のみ** — screen-flow.md の「対応選択 → 通知」は「通報者・被通報者に通知」と読めるが、
  `notification-item.tsx` の `report_resolved` ラベル（「通報の対応が完了しました」）が通報者向けの
  文言だったため、被通報者への通知は実装しなかった。被通報者はユーザー停止等の効果自体で状態変化に
  気づける前提
- **audit_logs の失敗はエラーを握りつぶす** — `resolveReport` は reports 更新が成功すれば
  audit_logs / notifications の INSERT 失敗を `console.error` に留め、Server Action 自体は成功扱いにする
  （判定そのものは既に反映済みのため、監査記録の失敗でユーザー影響のある操作全体を失敗にしたくない）。
  監査ログの欠落を検知する仕組みは無い
- **Server Action 呼び出し1回の中で複数テーブルを更新するがトランザクションではない** —
  排他制御として reports の条件付き UPDATE（`status IN (pending, reviewing)`）を対象への副作用より
  先に行い、0件なら `REPORT_ALREADY_RESOLVED` を返して副作用を実行しない形にしたため、
  「2人のadminが同時に判定して片方が上書きされる」レースは解消した（`/code-review` 指摘、2026-09-21）。
  ただし reports 更新に勝った**後**の副作用（posts/comments/profiles 更新）・audit_logs・通知の
  途中失敗はロールバックされない。admin の再実行を前提にした設計で、ロールバック機構は用意していない
- **対応判断:** cafe への対応・被通報者通知・監査ログの信頼性強化は、実運用で必要になってから着手する
- 参照: S_ADMIN_REPORTS / S_ADMIN_REVIEW 実装時にスコープ外と判断（2026-09-21）。
  `requireAdmin` の role のみチェック（status未確認）と notifications_insert_admin の type無制限は
  `/code-review` 指摘を受けて実装時に修正済み（2026-09-21）

### D49. `ng_words` `severity=warn` の運営レビューキュー送りを見送り

- **課題:** [tables.md #ng_words](../architecture/data-model/tables.md#ng_words) は「`block` は保存拒否、
  `warn` は運営レビューキューに送る」と書いているが、レビューキューにあたる `reports` テーブルは
  `reporter_id` が NOT NULL かつ `reports_insert_own` RLS が `auth.uid() = reporter_id` を要求する設計
  （[20260921000000_create_reports.sql](../../supabase/migrations/20260921000000_create_reports.sql)）。
  システムが自動生成する行に「通報者」を誰にするか、`reason` の CHECK 制約への追加値など
  別の設計判断が必要で1PRに収まらないため、今回は `block` の保存拒否のみを実装した
- **現状の動作:** `severity=warn` のワードは検出しても投稿・コメントをブロックしない（保存される）。
  [screen-flow.md](../design/screen-flow.md#3-投稿作成フロー) の「OK or warn」分岐と整合しており、
  同ドキュメントの設計メモ「NGワードの `block` は投稿時に自動ブロックするため、`reports` は
  ユーザー起点のみ」とも矛盾しない
- **対応判断:** `warn` の自動キュー送りが必要になったら、`reports` の `reporter_id` 扱い
  （NULL許容化 or システム用ダミーID）を先に設計してから着手する
- 参照: NGワード辞書・自動検出実装時にスコープ外と判断（2026-09-21）

### D50. S_OWNER_CLAIM で書類アップロード後に離脱すると owner-documents に孤立ファイルが残る

- **課題:** `verificationId` はクライアントで `crypto.randomUUID()` により生成し、DB行の予約なしに
  書類を `owner-documents/{user_id}/{verificationId}/...` へ直接アップロードする設計にした
  （[tables.md #cafe_owner_verifications](../architecture/data-model/tables.md#cafe_owner_verifications)、
  CHECK制約 `jsonb_array_length(document_urls) >= 2` があるため posts の予約行パターンが使えない）。
  申請送信前にページを離脱・リロードすると、アップロード済みファイルは Storage に残ったまま
  どの `cafe_owner_verifications` 行にも紐付かず孤立する。D19（`reservePost` の hidden 投稿放置）と
  同型の問題
- **現状の動作:** 実害は「Storage 容量を静かに消費する」のみ（他ユーザーからは読めない。
  `owner_documents_objects_select_own_or_admin` RLS で本人+adminのみ）
- **対応判断:** 定期バッチ（`created_at` が古く `cafe_owner_verifications` に対応行が無いパスを削除）
  が必要になったら着手。MVPの申請数では静観して問題ない規模と判断
- 参照: オーナー認証申請（S_OWNER_CLAIM/S_OWNER_PENDING）実装時に記録（2026-09-21）

### D51. `(owner)` ルートグループに `not-found.tsx` が無く、404が英語既定のまま

- **課題:** `S_OWNER_DASHBOARD`（`app/(owner)/owner/[cafeId]/page.tsx`）は他人のカフェへのアクセスを
  `notFound()` で弾くが、`(owner)` ルートグループには `S_CAFE_DETAIL` が持つような専用の
  `not-found.tsx`（`app/(browsing)/cafes/[id]/not-found.tsx` 参照）が無い。
  Next.js既定の英語404（"This page could not be found."）にフォールバックする。
  `owner/claim/[cafeId]` と `owner/pending` も同じ `notFound()` を使っており、この状態は
  ダッシュボード実装前から存在していた
- **現状の動作:** ステータスコードは正しく404になる（実害なし）。表示だけが他画面と不揃い
- **対応方針:** `app/(owner)/not-found.tsx` を1つ用意し、3画面（claim/pending/dashboard）で共有する
- 参照: カフェ経営者ダッシュボード（S_OWNER_DASHBOARD）実装時に記録（2026-09-21）

### D52. S_OWNER_DASHBOARD のメニュー5項目のうち遷移先があるものが無い

- **課題:** ワイヤー（[wireframes/owner.md #S_OWNER_DASHBOARD](../design/wireframes/owner.md#s_owner_dashboard経営者ダッシュボード)）
  のメニューは元々「店舗情報を編集・投稿分析を見る・ユーザー投稿一覧・公式投稿を作成・認証情報」の
  5項目だったが、後から追記された幹Cセクション（owner.md「S_OWNER_DASHBOARD への追加項目」）で
  「ユーザー投稿一覧」が「常連さん管理」に差し替わっており、2026-09-23 にワイヤー本体もこちらへ統一した。
  `routing.md` に定義があるのは `edit` / `analytics` / `regulars` のみで、「認証情報」に対応するルートは未定義。
- **解消済み（2026-09-22）:** **「公式投稿を作成」** は S_POST_OFFICIAL 実装に合わせて `/new/official` へ
  のリンクを開放した。
- **解消済み（2026-09-23）:** **「店舗情報を編集」** は S_OWNER_CAFE_EDIT 実装に合わせて
  `/owner/[cafeId]/edit` へのリンクを開放した。
- **解消済み（2026-09-23）:** **「常連さん管理」** は S_OWNER_REGULARS 実装に合わせて
  `/owner/[cafeId]/regulars` へのリンクを開放した（「ユーザー投稿一覧」は概念ごと削除）。
- **解消済み（2026-09-23）:** **「投稿分析を見る」** は S_OWNER_ANALYTICS 実装に合わせて
  `/owner/[cafeId]/analytics` へのリンクを開放した。
  残る1項目（認証情報）は引き続き「準備中」表示でリンクを張っていない
  （404を作る側にならないための暫定対応）
- **現状の動作:** ダッシュボードから認証情報には遷移できない。
  「認証情報」（認証日）相当のデータは✓公式認証済みバッジとしてダッシュボード本体に出ている
- **対応方針:** 「認証情報」は専用画面を作るか、ダッシュボード本体の表示で代替を続けるか未検討
- 参照: カフェ経営者ダッシュボード（S_OWNER_DASHBOARD）実装時に記録（2026-09-21）／公式投稿を作成のリンク開放（2026-09-22）／
  店舗情報編集のリンク開放（2026-09-23）／常連さん管理のリンク開放・ワイヤー統一（2026-09-23）／
  投稿分析のリンク開放（2026-09-23）

### D53. 複数カフェオーナーの一覧UI未対応

- **課題:** `cafes.verified_owner_id` は1ユーザーが複数カフェに持つことを制約上禁止していないが、
  マイページの「自分の店舗」導線（`getOwnedCafe`、`lib/owner/dashboard.ts`）は
  `verified_owner_id = userId` の先頭1件だけを案内する「1申請=1カフェ」前提の実装
- **現状の動作:** 2店舗目以降を経営するオーナーは、マイページから2店舗目のダッシュボードへ
  遷移する手段が無い（URLを直接知っていれば `/owner/{cafeId}` で開ける）
- **対応方針:** 複数店舗オーナーが実際に出てきたら、一覧UI（店舗切り替えドロップダウン等）を追加する
- 参照: カフェ経営者ダッシュボード（S_OWNER_DASHBOARD）実装時に記録（2026-09-21）

### D54. S_OWNER_DASHBOARD の「週別推移グラフ」（PC）が未実装

- **課題:** ワイヤー（[wireframes/owner.md #S_OWNER_DASHBOARD](../design/wireframes/owner.md#s_owner_dashboard経営者ダッシュボード)）
  のPC版は「今週のサマリー」と「最新の投稿」の間に折れ線グラフのセクションを置いているが、
  今回の実装では対応するセクション・プレースホルダーのどちらも用意していない
- **現状の動作:** PC版でも「今週のサマリー」の直下が「最新の投稿」になる（グラフ無し）
- **解消済み（2026-09-23）:** グラフ描画ライブラリの選定は完了（Recharts を追加）。
  `S_OWNER_ANALYTICS`（投稿分析、別画面）の折れ線グラフに採用した。
- **現状の動作:** ダッシュボード本体（PC版）には引き続きグラフを置いていない。
  週別推移は `S_OWNER_ANALYTICS` で確認できる
- **対応方針:** ダッシュボード本体への簡易版の追加はMVPの最小スコープでは省略も許容範囲と判断。
  必要になれば同じ Recharts で追加する
- 参照: カフェ経営者ダッシュボード（S_OWNER_DASHBOARD）実装時に記録（2026-09-21・`/code-review` 指摘）／
  ライブラリ選定・S_OWNER_ANALYTICS実装（2026-09-23）

### D55. 認証済みオーナーが自分のカフェを closed/hidden にすると自分でも閲覧できなくなる

- **課題:** `cafes` の SELECT RLS（`cafes_select_active_authenticated`）は
  `status = 'active' or is_admin()` のみで `verified_owner_id` を見ない。`cafe_business_hours` は
  `is_cafe_owner()`（security definer）で本人の書き込みだけは status を問わず通す設計になっているが
  （[`20260906140000_create_cafe_business_hours.sql`](../../supabase/migrations/20260906140000_create_cafe_business_hours.sql)
  のコメント参照）、`cafes` 本体の SELECT には同種の抜け道が無い。
  `getOwnerDashboard`・`getCafeDetail`（S_CAFE_DETAIL）は素朴な RLS 越しの select のため、
  この影響を受ける
- **解消済み（2026-09-22）:** **`getOwnedCafe`（`lib/owner/dashboard.ts`）** は
  `get_owned_cafe()`（security definer、`get_owner_verification_cafe` と同じ考え方）を使うよう
  修正した。公式投稿（S_POST_OFFICIAL）の「臨時休業」フォーマットは、まさに
  「カフェが closed/hidden になった状況を告知したい」場面で使われるため、この関数だけは
  status を問わず本人のカフェを引ける必要がある（`/code-review` 指摘、実装時に発覚）
- **現状の動作:** `getOwnedCafe` 経由（マイページ「自分の店舗」・S_POST_OFFICIAL）は
  closed/hidden でも本人から見える。`getOwnerDashboard`・`getCafeDetail` はカフェを
  closed/hidden にした瞬間、本人のダッシュボードも S_CAFE_DETAIL も404になり、
  再度 active に戻す手段も本人には無い（admin 頼みになる）。ダッシュボード実装で
  新たに踏んだわけではなく、既存の画面に及ぶ既知の未対応ギャップ
- **対応方針:** 残る `getOwnerDashboard` / `getCafeDetail` も `is_cafe_owner()` 相当の
  security definer 関数に寄せるか、ポリシーに `or verified_owner_id = auth.uid()` を足すかは
  要検討（「closed/hiddenを誰が・何のために付けるのか」がまだ未設計 — 現状 admin 専用の
  delete/update経路くらいしか status を変える手段が無い）
- 参照: カフェ経営者ダッシュボード（S_OWNER_DASHBOARD）実装時に記録（2026-09-21・`/code-review` 指摘）／
  `getOwnedCafe` 解消（公式投稿 S_POST_OFFICIAL 実装時、2026-09-22・`/code-review` 指摘）

### D56. S_POST_OFFICIAL の未対応点（「もっと見る」ページング・通知fan-outの上限・下書き）

- **課題:** 公式投稿（S_POST_OFFICIAL、幹C-2）実装時に意図的にスコープ外とした3点:
  1. **「オーナーから」の「もっと見る」** — `OwnerPostsSection` は直近3件のみ表示し、
     ワイヤーにある「もっと見る ▶」は出していない。`S_CAFE_DETAIL` に公式投稿だけの
     専用ルート／クエリパラメータが無いため
  2. **`notify_on_official_post` の通知fan-out上限** — 1カフェあたり直近1000人（`user_cafe_lists`
     に追加した順）までしか通知しない。1000人を超える人気カフェでは超過分に通知が届かない
  3. **公式投稿フォーム（今日のおすすめ/新メニュー/臨時休業）に下書き自動保存が無い** — 一般投稿の
     `useComposer`（15秒デバウンス）を流用せず、`useOfficialComposer`（下書き保存を持たない軽量フック）
     にした。ページを閉じると入力内容は失われる。ワイヤーにも下書き保存の記載が無く、要否は未検討
- **現状の動作:** 上記3点はそれぞれ「3件超は見えない」「1000人超のカフェで通知漏れ」
  「フォーム入力中の離脱で内容消失」という制約付きで動く
- **対応方針:** 1は専用ルート（例: `/cafes/[id]/official-posts`）の要否を含めて再検討。
  2はフェーズ2で別の配信基盤（バッチ・キュー）へ移行する際に解消。3は「豆知識」フォーマットで
  離脱時の入力ロス報告が実際に出たら `useComposer` 相当の下書き保存を追加する
- 参照: 公式投稿（S_POST_OFFICIAL）実装時に記録（2026-09-22）

### D57. S_OWNER_ANALYTICS で見送ったもの（期間の粒度・タグ/投稿者フィルタ・曜日別混雑度の期間非連動・Materialized View）

- **課題:** 投稿分析（S_OWNER_ANALYTICS、幹Cの最後の1画面）実装時に意図的にスコープ外とした4点:
  1. **期間選択の粒度** — ワイヤー（[wireframes/owner.md #S_OWNER_ANALYTICS](../design/wireframes/owner.md#s_owner_analytics投稿分析)）
     は「期間: [ 今週 ▼ ]」というドロップダウンのみで具体的な選択肢が書かれていないため、
     「直近4週間」「直近12週間」の2択（ピル型トグル）に簡略化した
  2. **タグ・投稿者によるフィルタ** — PC版ワイヤーの「フィルタ（タグ・投稿者）を左サイドバーに配置」は
     実装していない。よく使われるタグ・投稿者トップはいずれも静的な一覧表示のみで、
     クリックして推移グラフを絞り込む操作はできない
  3. **曜日別混雑度は期間トグルと連動しない** — `get_cafe_weekday_congestion(p_cafe_id)` は
     `p_from`/`p_to` を取らず、その店のカフェ混雑度報告を全期間から曜日別に集計する。
     KPI・推移グラフ・タグ・投稿者トップは選択した期間（4週間/12週間）でスコープが変わるが、
     曜日別混雑度だけは変わらない。曜日別の傾向は少ないサンプル数だと安定しないため、
     意図的に期間を絞らずデータを最大限使う判断（`/code-review` 指摘で意図と明記）
  4. **Materialized View** — ワイヤーに「MVPでは Materialized View から日次更新」とあるが、
     素朴な都度集計クエリ（`lib/owner/analytics.ts`）で実装した。負荷が出たら切り替える
- **現状の動作:** 上記4点はそれぞれ「期間は2択のみ」「一覧を絞り込めない」
  「曜日別混雑度は期間トグルの影響を受けない」
  「投稿数が増えると集計クエリが遅くなる可能性がある（未計測）」という制約付きで動く
- **対応方針:** 1は実際に使われる期間の要望が出たら選択肢を増やす。2はタグ・投稿者トップの
  クリックでURLクエリパラメータに絞り込み条件を載せる形を想定。3は「曜日別も期間で絞るべき」
  という要望が出たら `p_from`/`p_to` を追加する。4は投稿数の実測値を見てから判断
- 参照: 投稿分析（S_OWNER_ANALYTICS）実装時に記録（2026-09-23）

### D58. S_SEARCH の0件時サジェストは「真の類似度・地理的隣接」ではない簡易版

- **課題:** タグ検索（S_SEARCH）の0件時に出す「もしかして」（関連タグ提案）「エリアを広げる」
  （[wireframes/browsing.md #S_SEARCH](../design/wireframes/browsing.md#s_search)）は、
  類似タグ・隣接エリアの定義が未検討のまま引き継がれていた
- **現在の実装:** `lib/posts/search.ts` の `getRelatedTagSuggestions` / `getNearbyAreaSuggestions` は、
  選択中のタグ・エリアを除いた `priority` 上位を機械的に返すだけ。共起・意味的近さ・地理的隣接は
  一切見ていない。フィルタ未指定の状態だと「よく使うタグ」チップとほぼ同じ顔ぶれになる
- **対応方針（未検討）:** a) 現状維持（0件時は「他の人気タグ・エリアへの導線」と割り切る）
  b) `post_tags` の共起頻度からタグの関連度を算出する c) `areas` に隣接関係のマスタ列を足す
- **対応判断:** 未定。気分検索（幹A）の運用データが出てから判断する
- 参照: S_SEARCH 実装時に記録（2026-09-23）

### D59. S_BADGES 制覇マップは実SVG地図ではなく簡易版（一覧+チェックマーク）で実装する

- **課題:** [wireframes/mypage.md #S_BADGES](../design/wireframes/mypage.md#s_badges) の制覇マップは
  「東京23区の塗り分けマップ」を想定しているが、正確な23区SVGパスデータの用意は
  座標データ収集（A3・S_MAPの真のブロッカーと同種）に近い独立作業で、バッジUIのPRに含めると
  肥大化する
- **決定:** 簡易版（23区を一覧＋チェックマークで表示、達成率のみ数値で見せる）で実装する。
  `areas` テーブルの `level='ward' and prefecture_code='JP-13'` を一覧のソースにする
- **再検討条件:** 実SVG地図が別途必要になった場合（座標データA3の解消等）に、この画面の表示部分だけ
  差し替える。データ取得ロジック（訪問済みエリアの判定）は変更不要
- 参照: S_BADGES データ層実装（PR #69）のあとの引き継ぎで記録（2026-09-23）

### D60. D33で直した「送信中disabledがフォーカスを奪う」問題が、対象外の18箇所以上に残っている

- **課題:** D33は「楽観更新 + `startTransition` の中で `router.refresh()` を呼ぶ」6コンポーネントに
  絞って起票・解消したが、`/code-review` で `disabled={isPending}` を素通しにしている箇所を
  網羅的に grep したところ、対象外の実装にも同じ症状（送信中に無効化 → フォーカスが `<body>` へ落ちる）
  が残っていることが分かった。BlockButton は D33 で直した FollowButton と同じ
  `app/(browsing)/users/[username]/page.tsx` に並んで表示されるため、特に体感の差が出やすい
- **確認できた該当箇所（2026-09-23 grep、`disabled={isPending}` で検索）:**
  `components/features/profiles/block-button.tsx` / `components/features/settings/settings-form.tsx`
  （6箇所） / `components/features/blocks/blocked-user-list.tsx`（2箇所） /
  `components/features/search/search-result-feed.tsx` / `components/features/reports/report-form.tsx`
  （3箇所） / `components/features/admin/owner-verification-review-actions.tsx` /
  `components/features/admin/report-review-actions.tsx`（2箇所） /
  `components/features/admin/ng-word-manager.tsx`（5箇所） / `components/features/posts/post-feed.tsx`
  （もっと見る） / `components/features/posts/comment-list.tsx`（もっと見る） /
  `components/features/notifications/notification-list.tsx`（もっと見る） /
  `components/features/owner/owner-pending-view.tsx` / `components/features/owner/owner-claim-form.tsx`
  （4箇所） / `app/(owner)/owner/[cafeId]/analytics/export-csv-button.tsx` /
  `app/(owner)/owner/[cafeId]/regulars/regulars-view.tsx`（3箇所）
- **対応方針（未検討）:** すべてが同じ深刻度ではない。「もっと見る」系（ページ送り）は連打してもズレが
  起きにくく実害が小さい一方、フォーム送信・削除・承認/却下系のボタンは D33 と同じ実害がある。
  管理画面（admin/owner）はメインターゲットの10〜20代ユーザーが触らないため優先度は下げてよいかもしれない
- **対応案:** a) 実害の大きいもの（フォーム送信・削除系）から個別に D33 と同じ方式へ揃える
  b) 一括で `aria-busy` + ガードへ機械的に置換する（ただし1関数1目的のガード追加は手で見る必要があり、
  全自動化は難しい） c) 共通の送信ボタンコンポーネントを作り、新規実装はそちらを使う運用に倒す
  （既存分はマイグレーションしない）
- **注意:** `aria-busy` に切り替えても `disabled:opacity-50` 相当の視覚的な送信中表示は付かない
  （`components/ui/button.tsx` の `buttonVariants` が `disabled:` にしかスタイルを定義していないため）。
  D33対応済みの6コンポーネントも同じ状態で、これは新規に持ち込む問題ではないが、対応の範囲を
  広げるなら「送信中」の視覚表現も合わせて検討する余地がある
- **ユーザー影響大の10ファイルを解消（2026-09-24）:** 対応案 a）を採用し、`block-button.tsx` /
  `settings-form.tsx` / `blocked-user-list.tsx` / `search-result-feed.tsx` / `report-form.tsx` /
  `post-feed.tsx` / `comment-list.tsx` / `notification-list.tsx` / `owner-pending-view.tsx` /
  `owner-claim-form.tsx` の計21箇所を `aria-busy` + ハンドラ冒頭の `isPending` ガードに揃えた。
  `report-form.tsx` / `block-button.tsx` / `blocked-user-list.tsx` / `owner-claim-form.tsx` /
  `owner-pending-view.tsx` には D33 (`like-button.test.tsx`) と同型の「連打で2回目を送らない」
  回帰テストを追加した
- **`/code-review` で見つけたバグ（修正済み）:** `owner-claim-form.tsx` の書類「削除」ボタンに
  `isPending` ガードが無く、`claimCafe` 送信中に送信済み書類をStorageから実削除できてしまい、
  DB側の `document_urls` だけ壊れたパスが残る不整合が起き得た。`handleRemove` 冒頭に
  `if (isPending) return` を追加して防止した
- **管理画面（admin/owner）の残り5ファイルも解消（2026-09-25）:** `owner-verification-review-actions.tsx`
  （2箇所） / `report-review-actions.tsx`（2箇所） / `ng-word-manager.tsx`（6箇所） /
  `regulars-view.tsx`（3箇所） / `export-csv-button.tsx`（1箇所）の計14箇所を、ユーザー影響大の
  10ファイルと同じ `aria-busy` + ハンドラ冒頭の `isPending` ガードに揃えた。バリデーション由来の
  `disabled`（`owner-verification-review-actions.tsx` の却下理由必須、`ng-word-manager.tsx` の
  単語未入力）は `report-form.tsx` と同様に `disabled` を残し `aria-busy` と分離した。
  `ng-word-manager.tsx` は追加フォームと削除確認が `isPending` を共有する設計（`router.refresh()`
  が一覧側 state を更新しない罠を避けるための既存方針）のため、削除中は追加フォームの送信も
  止まる仕様のまま。5ファイルとも新規に回帰テストを追加（送信中も disabled にしない／連打で
  2回目を送らない）
- 参照: D33（送信中disabledのフォーカス喪失、4コンポーネント分解消）の `/code-review` で判明
  （2026-09-23）／ユーザー影響大の10ファイルを解消（2026-09-24、`fix/disabled-focus-loss-remaining`）／
  管理画面の残り5ファイルを解消（2026-09-25、`fix/disabled-focus-loss-admin`）

### D61. owner-claim-form.tsx の書類アップロードボタンに isPending ガードが無く、Storageファイルが孤立し得る 🟢 解消済み（2026-09-27）

- **課題:** `fix/disabled-focus-loss-admin`（D60管理画面分）の `/code-review` で判明。
  `components/features/owner/owner-claim-form.tsx:198` の「＋アップロード」ボタンは
  `disabled={uploadingType !== null}` のみで `isPending` を見ていない。`handleFilesSelected`
  にも `isPending` ガードが無い。ボタン直上のコメント（:199-200）は「追加アップロードは
  クロージャで確定済みの送信には影響しない」と書いているが誤り: `claimCafe` 送信中（`isPending`）
  に新しい書類をアップロードすると、Storageには保存されるが `handleSubmit` の `startTransition`
  が閉じ込めた古い `documents` 配列には含まれないため、`claimCafe` が成功して画面遷移した後、
  そのStorageオブジェクトは `document_urls` から永久に参照されない孤立ファイルになる
- **対応:** 同ファイルの `handleRemove`（削除側）に既にあった `if (isPending) return` ガードと
  同じものを `handleFilesSelected` の冒頭にも追加し、誤ったコメント（:199-200）も修正した。
  回帰テスト「送信中はアップロードボタンを押しても新しい書類を追加しない（孤立ファイル防止 — D61）」を追加
- 参照: D60 管理画面分（`fix/disabled-focus-loss-admin`）の `/code-review` で発見（2026-09-25）

### D62. GitHub Actions のワークフローを静的検査していない（actionlint 未導入）

- **課題:** `.github/workflows/` は CI で構文検査されておらず、壊れたワークフローがそのまま
  main に入る。エージェントパイプライン導入時（2026-09-25、`feature/agent-pipeline`）に実際に
  2件やらかしている
  - `nightly.yml` の Board Drift が `grep -qF ">12<"` で **HTML に存在しない文字列**を探しており、
    常に失敗する検査だった（ボードの集計値は埋め込み JSON から JS が算出するため静的には読めない）
  - `e2e.yml` の `github` コンテキストを `run:` に直接展開していた箇所は、
    semgrep の pre-commit hook が捕まえたので入る前に気づけた
- **なぜ手元で気づけなかったか:** 開発環境に YAML パーサが無く（`pyyaml` 未導入、
  node は WSL 経由のみ）、ワークフローを実行せずにコミットしていた。
  検証は `bash -n` とタブ文字チェック程度しかできていない
- **対応案:**
  - a) `rhysd/actionlint` を CI に追加（GitHub Action 版なら新規の npm 依存は増えない）
  - b) lefthook の pre-commit に `.github/workflows/**` 変更時のみ actionlint を走らせる
  - c) 現状維持（semgrep の hook が一部は捕まえる）
- **注意:** actionlint は構文とコンテキスト参照の誤りは捕まえるが、上記の
  「常に失敗する検査」のような**論理バグは防げない**。過信しないこと
- **決定期限:** なし。ワークフローを触る頻度が上がったら判断する
- 参照: エージェントパイプライン導入（2026-09-25、PR #79 / #81）で顕在化

### D63. S_MAP（`/map`）で見送ったもの

- **課題:** ワイヤー（[wireframes/browsing.md](../design/wireframes/browsing.md) #S_MAP）に対して、
  実装したのは **エリア絞り込み・カフェ名検索・地図/一覧切替・マーカー・ボトムシート（詳細へ／行きたい）・
  現在地取得（失敗時は新宿駅にフォールバック）** のみ
- **出していないものと理由:**
  - **雰囲気・利用機会タグでの絞り込み（解消済み・2026-09-29）** — `nearby_cafes` に
    `p_mood_tag` / `p_occasion_tag`（タグの `slug`）を追加し、「該当カテゴリのタグが付いた
    公開投稿を1件以上持つカフェ」を絞り込み条件にした（カフェに直接タグを集計するテーブルは
    作らず、既存の `posts` / `post_tags` を EXISTS で参照するだけに留めた。RLS は security invoker の
    ままなので posts_select の可視性がそのまま効く）。`FilterBar` に雰囲気・利用機会の2セレクトを追加
  - **ボトムシートの上スワイプで一覧に切替（ドラッグジェスチャ）** — ボタントグルで代替した。
    `vaul` 等の新規依存を避けるため（既存の `radix-ui` のみで実装する方針とした）
  - **既存カフェの `cafes.location` バックフィル** — 解消済み（2026-09-28）。`/admin/cafe-locations`
    に管理画面ボタンを追加し、`status='active'` かつ `location` 未設定のカフェを
    `lib/geocoding/google.ts`（Geocoding API）で一括バックフィルできるようにした
    （`app/_actions/admin-cafe-locations.ts`）。ローカルでは動作確認済みだが、
    **production への実際の適用はまだ実行していない**（admin権限を持つ人が
    `/admin/cafe-locations` を開いてボタンを押す運用）
  - **S_ONBOARD_AREA の「現在地から検索」（解消済み・2026-09-30）** — `nearest_area` RPC（KNN距離順、
    `level='ward'`固定。`sub_area`まで候補に含めると「23区制覇」の母数粒度とズレるため引数化しなかった）
    を追加し、`area-form.tsx` に「位置情報を使う」ボタンを実装
  - **S_CAFE_NEW の自動エリア判定** — 上記と同じ `ST_Distance` 最寄り判定を転用できるが、S_CAFE_NEW は
    ワイヤーフレーム自体が存在せず仕様の決め打ちが要るため、引き続きスコープ外
- **本番投入前に要対応:** `AdvancedMarker` に使っている Map ID は Google 公式の検証用
  `DEMO_MAP_ID`。本番運用前に Google Cloud Console で専用の Map ID を作成して差し替える
  （`components/features/map/cafe-map.tsx`）
- **決定期限:** なし。上記いずれかの機能要望が具体化した時点で着手
- 参照: feat/s-map 実装時に決定（2026-09-26）

### D64. S_PROFILE_EDIT でアバターを保存前に選び直す・画面を離れると孤立ファイルが残る ✅ 解消済み（2026-10-03）

- **課題（経緯）:** `uploadAvatar`（`lib/storage/avatar-client.ts`）は選択した時点で `avatars` へ直PUTする。
  保存（`updateProfile`）前にユーザーが別のファイルを選び直す、または保存せずに画面を離れると、
  直前にアップロードした分がどこからも参照されないまま Storage に残る。D50（owner-documents の
  離脱時孤立ファイル）と同型の問題だが、D50は一度きりの申請フローで発生頻度が低いのに対し、
  アバターの選び直しは「プレビューを見て気に入らず選び直す」という通常の操作で毎回起こりうるため、
  同じ「静観」判断は当てはまらないと判断した
- **対応内容:** `profile-edit-form.tsx` で直前にアップロードした（まだ保存していない）パスを
  `pendingAvatarPathRef` で保持し、1) 選び直し時に新しいアップロードが成功した時点で前のパスを削除
  2) 保存せずアンマウントされた場合（クリーンアップ）に削除、の2経路でカバーする。保存が成功したら
  ref を null に戻し、離脱時クリーンアップが保存済みの新アバターを巻き込んで消さないようにする。
  削除は `lib/storage/avatar-client.ts` の `deleteUnsavedAvatarFile`（`avatars_objects_delete_own` RLS
  によりブラウザから直接 remove できる、owner-document-client.ts と同じ型）
- **既知の残課題:** `beforeunload`（ブラウザタブを閉じる・リロード）経路は捕捉できない
  （既存の「変更検知」コメント参照）。この経路はD50と同じく発生頻度が低く、Storage容量への実害も
  小さいため静観する
- 参照: `/code-review` 指摘により実装時に追加対応（2026-10-03）

### D65. S_PROFILE_EDIT の `updateProfile` が同一ユーザーの同時保存に対して原子性を持たない

- **課題:** `updateProfile`（`app/_actions/profiles.ts`）はアバター差し替え時「現在の `avatar_url` を
  読む → `profiles` を更新 → 読んだ値を元に旧ファイルを削除」の順で処理するが、読み取りと更新の間に
  ロックが無い。同一ユーザーが2タブで同時に別々のアバターを保存すると、両方のタブが更新前の同じ
  `avatar_url` を読んでしまい、後勝ちの更新で上書きされた方のファイルが `avatar_url` からも
  削除処理からも参照されなくなり孤立する
- **影響:** 同一ユーザーが同時に複数タブで同じ編集画面を開いて保存する、という低頻度の操作でのみ
  発生する。実害は「Storageを静かに消費する」のみで、DBの整合性（`avatar_url` が指すファイルが
  存在すること）は壊れない
- **対応判断:** D3（Storageオーファン掃除方針）・D50と同じ「静観して問題ない規模」の判断を適用する。
  原子性を持たせるには DB関数化（`avatar_url` の比較・更新・削除対象パスの算出をトランザクション化）
  が必要だが、発生頻度・実害に対してコストが見合わない。D3の定期バッチ案（対応案a/b）が実装される
  タイミングで、この経路の孤立ファイルもまとめて回収できる
- 参照: `/code-review` 指摘により記録（2026-10-03）

## 削除・アーカイブ判断待ち

現時点で「削除する」と決めた項目はなし。追加・変更発生時にここに追記。
