# バッジ初期セット（MVP 20個）

`badges` テーブルに投入する初期データ。獲得条件は `badges.criteria (jsonb)` で表現し、判定は Server Actions から呼ぶ `checkAndAwardBadges` で実行する（DBトリガーには置かない。[判定タイミング](#判定タイミング) 参照）。

**差別化戦略との整合:** 幹A（気分検索）を反映して**シーン系バッジ**、幹C（オーナー連携）を反映して**行きつけ系バッジ**を設けている（[product/positioning.md](../product/positioning.md) 参照）。

## 分類方針

5カテゴリ・合計20個。段階制（初級→中級→上級）を意識。

| カテゴリ | 個数 | 意図 |
|---|---|---|
| 投稿系 | 4 | サービス利用の継続を評価 |
| エリア系 | 3 | 探索を促進、制覇マップ連動 |
| **シーン系** ⭐️ | 6 | 幹A: 気分・シーンの多様な体験 |
| **行きつけ系** ⭐️ | 4 | 幹C: オーナーとの関係深化 |
| コミュニティ系 | 3 | 対人インタラクション |

（訪問系はエリア系に統合、時間系はシーン系に発展的解消）

## 具体案

### 投稿系

| コード | 名称 | 条件 |
|---|---|---|
| `POST_FIRST` | はじめての一杯 | 初投稿 |
| `POST_10` | カフェレポーター | 累計10投稿 |
| `POST_50` | カフェジャーナリスト | 累計50投稿 |
| `POST_100` | カフェセンパイ | 累計100投稿 |

### エリア系（制覇マップ連動）

| コード | 名称 | 条件 |
|---|---|---|
| `AREA_3` | 街歩き入門 | 3エリアで投稿 |
| `AREA_10` | 街歩き上手 | 10エリアで投稿 |
| `AREA_TOKYO_23` | 東京23区制覇 | 東京23区すべてで投稿 |

### ⭐️ シーン系（幹A の中核）

各シーン（`tags.slug`）での投稿・訪問実績で獲得。

| コード | 名称 | 条件 |
|---|---|---|
| `SCENE_MORNING` | 朝カフェマスター | `morning-cafe` タグ付き投稿を累計10件 |
| `SCENE_NIGHT` | 夜カフェ探検家 | `night-cafe` タグ付き投稿を累計10件 |
| `SCENE_SOLO` | ひとり時間マスター | `solo-time` タグ付き投稿を累計10件 |
| `SCENE_RAINY` | 雨の日マスター | `rainy-day` タグ付き投稿を累計5件 |
| `SCENE_WORK` | 集中カフェマスター | `work` or `study` タグ付き投稿を累計10件 |
| `SCENE_EXPLORER` | シーン開拓者 | 5つ以上の異なるシーンタグで投稿 |

### ⭐️ 行きつけ系（幹C の中核）

`regular_customers` テーブルの認定関係で獲得。

| コード | 名称 | 条件 |
|---|---|---|
| `REGULAR_FIRST` | はじめての行きつけ | 常連認定を1件獲得 |
| `REGULAR_3` | 行きつけコレクター | 3店で常連認定 |
| `REGULAR_5` | カフェの顔 | 5店で常連認定 |
| `REGULAR_VIP` | カフェのVIP | 10店で常連認定 |

### コミュニティ系

| コード | 名称 | 条件 |
|---|---|---|
| `COM_10_FOLLOWERS` | フォロワー10 | フォロワー10人達成 |
| `COM_100_LIKES` | いいねの受け手 | 累計いいね100獲得 |
| `COM_FIRST_LIKE_GIVEN` | はじめての返報性 | 他人の投稿に初いいね |

## `badges.criteria` のJSON構造例

```json
// シーン系
{
  "type": "post_count_with_tag",
  "tag_slug": "morning-cafe",
  "threshold": 10
}

{
  "type": "post_count_with_tags_or",
  "tag_slugs": ["work", "study"],
  "threshold": 10
}

{
  "type": "distinct_scene_tag_count",
  "category": "occasion",
  "threshold": 5
}

// 行きつけ系
{
  "type": "regular_customer_count",
  "threshold": 3
}

// エリア系
{
  "type": "distinct_area_count",
  "scope": "tokyo_23",
  "threshold": 23
}
```

## 判定タイミング

**判定は DBトリガーではなく、Server Actions から呼ぶ `checkAndAwardBadges(supabase, userId, trigger)` に一元化する**
（理由と実装方針は [data-model/README.md #バッジ付与ロジックの設計](../architecture/data-model/README.md#バッジ付与ロジックの設計) を参照）。

| バッジ種別 | `BadgeTrigger` | 呼び出し元 |
|---|---|---|
| POST_*, AREA_*, SCENE_* | `POST_CREATED` | `app/_actions/posts.ts`（投稿公開後） |
| REGULAR_* | `REGULAR_AWARDED` | `app/_actions/owner.ts`（常連認定後） |
| COM_100_LIKES | `LIKE_RECEIVED` | `app/_actions/likes.ts`（いいねを受けた側で判定） |
| COM_FIRST_LIKE_GIVEN | `LIKE_GIVEN` | `app/_actions/likes.ts`（いいねをした側で判定） |
| COM_10_FOLLOWERS | `FOLLOW_RECEIVED` | `app/_actions/follows.ts`（フォローされた側で判定） |

`BadgeTrigger` の型定義は `types/badges.ts`、判定ルールは `lib/badges/rules.ts` に集約する。

## フェーズ2以降の拡張想定

- 季節限定バッジ（春の桜カフェ、クリスマス限定 等）
- 経営者限定バッジ（「認証取得」「初公式投稿」「常連10人達成」）
- コラボバッジ（外部イベント連携）
- ゴールド階層（各バッジの上位版）

これらは既存 `badges.criteria` の型を拡張する形で追加可能。

## 運用上の注意

- **バッジ画像アセット:** 20個 × 3階層（未取得/取得済/獲得エフェクト）= 60画像が必要（[product/pending-items B1](../product/pending-items.md#b1-バッジ画像アセット)）
- **通知:** バッジ獲得時に `notifications.type='badge'` で通知（再訪促進）
- **希少性の維持:** 一度リリースしたバッジの条件は変えない
- **シーンバッジの粒度:** シーンタグの利用が広がったら、SILVER / GOLD 階層を追加検討
- **行きつけバッジの上限:** 「10店常連」は現実的に難易度が高い。長期プレイヤー向けの目標として設計
