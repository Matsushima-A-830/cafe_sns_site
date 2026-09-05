# ドメイン用語集（ユビキタス言語）

**このプロジェクトのユビキタス言語（Ubiquitous Language）を定義する。**

すべてのメンバー（現状はユーザー本人 + Claude Code）が同じ言葉で同じ概念を指せることを目指す。
コード・DB・UI・ドキュメント・議論で用語がずれると、必ずバグと認識ズレの原因になる。

## 原則

1. **UI日本語 と コード英語 は 1:1 対応** — 曖昧な複数表現を認めない
2. **新しい概念には必ず用語をまず決めてからコードを書く** — 実装が先行すると命名が場当たりになる
3. **既存語との衝突を避ける** — 「保存」がすでにあれば新機能は別の言葉を使う
4. **迷ったらこのドキュメントを見る、この文書にない語は使わない**

---

## エンティティ（データモデル）

| 日本語UI | 英語コード | DB | 説明 |
|---|---|---|---|
| ユーザー / ユーザ | `user` | `profiles` (+ `auth.users`) | サービスに登録したアカウント |
| プロフィール | `profile` | `profiles` | ユーザーの表示情報 |
| カフェ / 店舗 | `cafe` | `cafes` | 実在するカフェ店舗 |
| 投稿 | `post` | `posts` | ユーザーが作成した写真 + 本文 |
| 短文投稿 | `short post` | `posts.post_type = 'short'` | 写真中心の短いコメント投稿 |
| ブログ投稿 / ブログ | `blog post` | `posts.post_type = 'blog'` | Tiptapで書く長文投稿 |
| 下書き | `draft` | `drafts` | 未公開の投稿の途中状態 |
| コメント | `comment` | `comments` | 投稿へのユーザー返信 |
| 返信 | `reply` | `comments.parent_id` | コメントへの返信（コメントの子） |
| タグ | `tag` | `tags` | 投稿の分類ラベル |
| エリア | `area` | `areas` / `cafes.area_code` / `area_visits.area_code` / `profiles.home_area_code` | 制覇マップで使う地理区分（ISO 3166-2準拠）。**エリアを参照する列は必ず `areas.code` への FK にする**（自由テキストで持たない） |
| ホームエリア | `home area` | `profiles.home_area_code` | ユーザーがよく行くエリア。おすすめ・タグサジェストの初期値 |
| バッジ | `badge` | `badges` / `user_badges` | ゲーミフィケーション達成報酬 |
| 通報 | `report` | `reports` | ユーザーからの違反報告 |
| ブロック | `block` | `blocks` | 相互非表示化 |
| フォロー | `follow` | `follows` | 他ユーザーの投稿を追う関係 |
| 通知 | `notification` | `notifications` | ユーザー宛のイベント通知 |
| NGワード | `ng word` | `ng_words` | 投稿禁止語 |
| 常連 / 常連さん | `regular customer` / `regular` | `regular_customers` | オーナーが顧客に付与する認定関係（幹C） |
| 気分 / シーン | `scene` / `mood` | `tags.category='occasion'` | 「ひとり時間」「朝カフェ」等の利用機会（幹A） |
| オーナー限定投稿 | `official post` | `posts.is_official = true` | 認証済みオーナーが投稿する公式コンテンツ |
| オーナー公式返信 | `official reply` | `comments.is_official = true` | オーナーによる公式コメント |
| オーナー限定フォーマット | `official format` | `posts.official_format` | 豆知識/今日のおすすめ/臨時休業/新メニュー |
| 行きつけ | `home cafe` / `regular cafe` | `regular_customers` から派生 | 常連認定されたカフェ（ユーザー視点） |

---

## アクション動詞

**日本語UI ↔ 英語動詞は 1対1 対応。似た動作でも動詞を分けて意味を明確にする。**

### 特に混同しやすい3種（要注意）

| 日本語 | 英語動詞 | 対象 | 意味 |
|---|---|---|---|
| **お気に入りに登録** | `favorite` | カフェ | 常連・好きなカフェ（既訪問想定） |
| **行きたいに追加** | `wantToGo` | カフェ | まだ行っていない、行ってみたいカフェ |
| **保存** | `bookmark` | 投稿 | 参考にしたい投稿を後で見返す |

このプロジェクトでは:
- 「保存」= 投稿単位 (`post_bookmarks`)
- 「お気に入り」「行きたい」= カフェ単位 (`user_cafe_lists.list_type`)

**混ぜないこと:**
- ❌ 「カフェを保存」 → ✅「カフェをお気に入り」or「カフェを行きたいに追加」
- ❌ 「投稿を行きたい」 → ✅「投稿を保存」

### 全アクション一覧

| 日本語 | 英語動詞 | 対象 | メソッド例 |
|---|---|---|---|
| 投稿する | `create post` | posts | `createPost()` |
| 公開する | `publish` | drafts → posts | `publishDraft()` |
| 下書き保存 | `save draft` | drafts | `saveDraft()` |
| 削除する | `delete` (soft) | posts / comments | `deletePost()` |
| いいねする / いいね解除 | `toggle like` | posts | `toggleLike()` |
| 保存 / 保存解除 | `toggle bookmark` | posts | `toggleBookmark()` |
| お気に入り登録 / 解除 | `toggle favorite` | cafes | `toggleFavorite()` |
| 行きたい追加 / 解除 | `toggle wantToGo` | cafes | `toggleWantToGo()` |
| フォロー / フォロー解除 | `toggle follow` | users | `toggleFollow()` |
| ブロック / ブロック解除 | `toggle block` | users | `toggleBlock()` |
| 通報する | `create report` | posts / comments / users / cafes | `createReport()` |
| コメントする | `create comment` | posts | `createComment()` |
| 返信する | `create reply` | comments | `createComment({ parentId })` |
| 認証申請する | `claim` | cafes（オーナー認証） | `claimCafe()` |
| 承認する | `approve` | cafe_owner_verifications | `approveClaim()` |
| 却下する | `reject` | cafe_owner_verifications | `rejectClaim()` |
| 混雑度を報告 | `report congestion` | cafe_congestion_reports | `reportCongestion()` |
| 常連認定する | `award regular` | regular_customers | `awardRegular()` |
| 常連認定を取り消す | `revoke regular` | regular_customers | `revokeRegular()` |
| 申請を取り下げる | `withdraw` | cafe_owner_verifications | `withdrawClaim()` |

---

## 状態・ロール・区分

### ユーザー状態 (`profiles.status`)

| 日本語 | コード | 意味 |
|---|---|---|
| アクティブ | `active` | 通常利用可能 |
| 同意待ち | `pending_consent` | 未成年で保護者同意未完了 |
| 停止中 | `suspended` | 運営により利用停止 |
| 削除済み | `deleted` | 論理削除済み |

### ユーザーロール (`profiles.role`)

| 日本語 | コード | 意味 |
|---|---|---|
| 一般ユーザー | `user` | 標準権限 |
| 経営者 / オーナー | `owner` | カフェ認証済み |
| 管理者 | `admin` | 運営 |

### 投稿状態 (`posts.status`)

| 日本語 | コード | 意味 |
|---|---|---|
| 公開 | `published` | 通常公開 |
| アーカイブ | `archived` | 自主非公開 |
| 非表示 | `hidden` | 運営による非公開 |

### 認証申請状態 (`cafe_owner_verifications.status`)

| 日本語 | コード | 意味 |
|---|---|---|
| 審査中 | `pending` | 提出後 |
| 承認 | `approved` | 認証完了 |
| 却下 | `rejected` | 却下 |
| 取り下げ | `withdrawn` | 申請者が自分で取り下げ |

### 通報状態 (`reports.status`)

| 日本語 | コード | 意味 |
|---|---|---|
| 未対応 | `pending` | キュー投入直後 |
| 対応中 | `reviewing` | 運営レビュー中 |
| 対応済 | `resolved` | 措置完了 |
| 対応不要 | `rejected` | 違反なしと判断 |

### 通報理由 (`reports.reason`)

| 日本語 | コード |
|---|---|
| スパム / 宣伝 | `spam` |
| 嫌がらせ / 誹謗中傷 | `harassment` |
| 未成年に不適切 | `minor_risk` |
| 著作権侵害 | `copyright` |
| 個人情報を含む | `privacy` |
| その他 | `other` |

### 通知タイプ (`notifications.type`)

`like` / `comment` / `follow` / `mention` / `badge` / `owner_verified` / `regular_awarded` / `official_post` / `report_resolved`
（各タイプの発火元と宛先は [tables.md notifications](./architecture/data-model/tables.md#notifications) 参照）

### タグカテゴリ (`tags.category`)

| 日本語 | コード | 例 |
|---|---|---|
| エリア | `area` | #渋谷区 #表参道 |
| 雰囲気 | `mood` | #静か #おしゃれ |
| 利用機会 | `occasion` | #朝カフェ #デート #Wi-Fi #電源 |
| その他 | `other` | #自家焙煎 #ペット可 |

**`occasion` と `other` の境界:**

- `occasion` = **その気分でカフェを探すときの入り口になる条件**。「作業したい」から探す人にとって #Wi-Fi #電源 は設備ではなく**シーンそのもの**なので occasion に置く（幹Aの「今、どんなカフェ気分？」に出す）
- `other` = **候補を絞り込んだ後に効く、こだわり条件**。#自家焙煎 #ペット可 のように、それ単独では探し始めない条件
- 判断に迷ったら「ホーム最上部の気分チップに出したいか？」で決める

**`area` カテゴリの位置づけ:**

エリアの正は [`areas` マスタテーブル](./architecture/data-model/tables.md#areas)。検索フィルタ・制覇マップ・カフェの紐付けはすべて `areas.code` を使う。
`tags.category='area'` は**投稿本文に付くラベル用**で、厳選タグ30個には含めない（[seed/curated-tags-initial-set.md](./seed/curated-tags-initial-set.md)）。エリアで絞り込むUIをタグ側で作らないこと。

---

## UI構造用語

| 日本語 | コード | 説明 |
|---|---|---|
| ホーム | `home` | ログイン後のトップ |
| 発見 | `explore` | おすすめ投稿一覧 |
| タイムライン | `timeline` | フォロー中の投稿一覧 |
| 地図ビュー | `map view` | 地図でカフェ探索 |
| マイページ | `my page` | 自分のプロフィール |
| ダッシュボード | `dashboard` | 経営者用管理画面 |
| ヒーロー画像 | `hero image` | ページ最上部の大きな画像 |
| サムネイル | `thumbnail` | 一覧表示用の小画像 |
| アバター | `avatar` | プロフィール画像 |
| バナー | `banner` | 告知等の帯状表示 |
| ボトムシート | `bottom sheet` | モバイル下から上がるパネル |
| モーダル | `modal` | 中央ダイアログ |
| トースト | `toast` | 画面隅の短時間表示 |
| バッジ（UI） | `badge` | カウンタの数字表示（アイコン付き） |
| チップ | `chip` | タグ的な小さなラベル |
| プログレスバー | `progress bar` | 進捗表示 |

**注意:** 「バッジ」は文脈で2つの意味:
- **ゲーミフィケーションのバッジ** — `badge` (entity)
- **UI要素のバッジ**（通知件数の丸バッジ等） — `badge` (component)

コード内では前者を `Badge`、後者を `NotificationBadge` `CountBadge` 等で区別する。

---

## 数値・単位

| 概念 | 単位 | 例 |
|---|---|---|
| タイムスタンプ | `timestamptz` (UTC) | DB保存、UI表示は JST 変換 |
| 距離 | メートル | 「徒歩3分」= 240m相当 |
| 画像サイズ | バイト | 投稿画像 10MB / アバター 2MB |
| ページング | 20件/ページ | 標準の limit |
| デバウンス | 秒 | 下書き自動保存 = 15秒 |

---

## 略語・命名規則

| 場面 | 例 |
|---|---|
| 変数 | camelCase (`postId`, `userProfile`) |
| 関数 | camelCase 動詞始まり (`createPost`, `toggleLike`) |
| コンポーネント | PascalCase (`PostCard`, `LikeButton`) |
| 型 | PascalCase (`PostSchema`, `UserRole`) |
| 定数 | UPPER_SNAKE_CASE (`MAX_TAGS_PER_POST`) |
| DBテーブル・列 | snake_case (`post_tags`, `author_id`) |
| ファイル | kebab-case (`post-card.tsx`, `use-auth.ts`) |
| URL slug | kebab-case (`/want-to-go`, `/owner/pending`) |

### 略語の禁止

以下の略語は使わない（意味不明化するため）:

- ❌ `usr` → ✅ `user`
- ❌ `img` → ✅ `image`
- ❌ `btn` → ✅ `button`
- ❌ `prof` → ✅ `profile`

例外（業界標準として通用するもの）:
- ✅ `id`, `url`, `ok`, `db`, `ui`, `ux`, `api`, `sql`, `dto`, `dom`, `css`, `env`

---

## 追加時のルール

新しい概念（機能・状態・UI要素）を追加する際:

1. **本用語集にまずエントリを作る**（日本語 / 英語 / DB / 説明）
2. 既存語との衝突を確認
3. その上でコード実装に入る

これを守ることで、実装がドキュメントに追いつくのではなく、ドキュメントが実装をリードする状態を保てる。

---

## メンテナンス

- **用語追加/変更時:** このドキュメントを更新 → 関連するコード・DB・UI・docsを揃える
- **議論で新語が出た時:** 必ず既存語との違いを言語化してからエントリ追加
- **AI（Claude Code）に指示する時:** 迷った用語はこのドキュメントを参照するよう指示

## 参照される場所

このユビキタス言語は以下のドキュメントで使われる:
- [architecture/data-model/tables.md](./architecture/data-model/tables.md)
- [architecture/routing.md](./architecture/routing.md)
- [design/screen-flow.md](./design/screen-flow.md)
- [design/wireframes/](./design/wireframes/)
- [architecture/error-catalog.md](./architecture/error-catalog.md)

**齟齬を見つけたらこの用語集を正とする。**
