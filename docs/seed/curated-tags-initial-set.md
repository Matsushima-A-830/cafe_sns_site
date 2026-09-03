# 厳選タグ初期セット（MVP 30個）

`tags` テーブルに `is_curated = true` として投入する初期データ。**シーンタグ（occasion）を第一級市民として最上位に置く**（差別化戦略 [幹A](../product/positioning.md)）。

## 配分と優先度

| カテゴリ | 個数 | priority | 意図 |
|---|---|---|---|
| occasion（シーン） | 15 | 100 | 幹A の中核。「今、どんなカフェ気分？」に応える |
| mood（雰囲気） | 10 | 50 | 店の性格を表現 |
| other（設備・こだわり） | 5 | 10 | 実用条件 |

`priority` の値は UI 表示順の重み。数値の絶対値には意味なく、相対順序のみ意味を持つ。

---

## occasion（シーン / 気分） 15個

**幹A の中核。ホーム最上部「今、どんなカフェ気分？」の選択肢もここから抽出。**

| slug | label | 説明 |
|---|---|---|
| `solo-time` | ひとり時間 | 一人でゆっくり過ごしたい時 |
| `morning-cafe` | 朝カフェ | 朝の時間に訪れたい店 |
| `morning-open` | モーニング | モーニングメニューがある店 |
| `night-cafe` | 夜カフェ | 夜遅くまで営業、静かに過ごせる |
| `date` | デート | デート向き、雰囲気のよい店 |
| `girls-meetup` | 女子会 | 話しやすい、映えるメニュー |
| `study` | 勉強 | 勉強に集中できる環境 |
| `work` | ワーク | ノマドワーク向き |
| `wifi-available` | Wi-Fi | Wi-Fi完備 |
| `power-outlet` | 電源 | 電源席あり |
| `rainy-day` | 雨の日 | 雨の日にこもりたい店 |
| `relax` | のんびり | 時間を気にせずくつろげる |
| `early-open` | 早朝営業 | 7時前オープン |
| `late-open` | 夜遅くまで営業 | 22時以降営業 |
| `kids-welcome` | 子連れOK | 子連れ歓迎、ベビーカー可 |

---

## mood（雰囲気） 10個

| slug | label | 説明 |
|---|---|---|
| `quiet` | 静か | 静かに過ごせる |
| `stylish` | おしゃれ | インテリアが凝っている |
| `retro` | レトロ | 昭和・大正の趣 |
| `warm-wood` | 木のぬくもり | 木材を活かした温かい空間 |
| `antique` | アンティーク | アンティーク調 |
| `mid-century` | ミッドセンチュリー | 20世紀中葉のデザイン |
| `japanese` | 和カフェ | 和のテイスト |
| `book-cafe` | ブックカフェ | 本が読める、本が置いてある |
| `garden` | 庭付き | 庭・中庭がある |
| `terrace` | テラス | テラス席あり |

---

## other（設備・こだわり） 5個

| slug | label | 説明 |
|---|---|---|
| `roastery` | 自家焙煎 | 店内で焙煎 |
| `specialty` | スペシャルティコーヒー | 高品質コーヒー専門 |
| `sweets` | スイーツ充実 | ケーキ・パフェ等のスイーツが売り |
| `pet-friendly` | ペット可 | ペット同伴可 |
| `no-smoking` | 禁煙 | 全席禁煙 |

---

## Seed SQL 例

```sql
insert into public.tags (slug, label, category, priority, is_curated, description) values
  -- occasion (priority 100)
  ('solo-time',       'ひとり時間', 'occasion', 100, true, '一人でゆっくり過ごしたい時'),
  ('morning-cafe',    '朝カフェ',   'occasion', 100, true, '朝の時間に訪れたい店'),
  ('morning-open',    'モーニング', 'occasion', 100, true, 'モーニングメニューがある店'),
  ('night-cafe',      '夜カフェ',   'occasion', 100, true, '夜遅くまで営業、静かに過ごせる'),
  ('date',            'デート',     'occasion', 100, true, 'デート向き、雰囲気のよい店'),
  ('girls-meetup',    '女子会',     'occasion', 100, true, '話しやすい、映えるメニュー'),
  ('study',           '勉強',       'occasion', 100, true, '勉強に集中できる環境'),
  ('work',            'ワーク',     'occasion', 100, true, 'ノマドワーク向き'),
  ('wifi-available',  'Wi-Fi',      'occasion', 100, true, 'Wi-Fi完備'),
  ('power-outlet',    '電源',       'occasion', 100, true, '電源席あり'),
  ('rainy-day',       '雨の日',     'occasion', 100, true, '雨の日にこもりたい店'),
  ('relax',           'のんびり',   'occasion', 100, true, '時間を気にせずくつろげる'),
  ('early-open',      '早朝営業',   'occasion', 100, true, '7時前オープン'),
  ('late-open',       '夜遅くまで営業', 'occasion', 100, true, '22時以降営業'),
  ('kids-welcome',    '子連れOK',   'occasion', 100, true, '子連れ歓迎、ベビーカー可'),

  -- mood (priority 50)
  ('quiet',           '静か',       'mood',     50,  true, '静かに過ごせる'),
  ('stylish',         'おしゃれ',   'mood',     50,  true, 'インテリアが凝っている'),
  ('retro',           'レトロ',     'mood',     50,  true, '昭和・大正の趣'),
  ('warm-wood',       '木のぬくもり', 'mood',   50,  true, '木材を活かした温かい空間'),
  ('antique',         'アンティーク', 'mood',   50,  true, 'アンティーク調'),
  ('mid-century',     'ミッドセンチュリー', 'mood', 50, true, '20世紀中葉のデザイン'),
  ('japanese',        '和カフェ',   'mood',     50,  true, '和のテイスト'),
  ('book-cafe',       'ブックカフェ', 'mood',   50,  true, '本が読める、本が置いてある'),
  ('garden',          '庭付き',     'mood',     50,  true, '庭・中庭がある'),
  ('terrace',         'テラス',     'mood',     50,  true, 'テラス席あり'),

  -- other (priority 10)
  ('roastery',        '自家焙煎',   'other',    10,  true, '店内で焙煎'),
  ('specialty',       'スペシャルティコーヒー', 'other', 10, true, '高品質コーヒー専門'),
  ('sweets',          'スイーツ充実', 'other',  10,  true, 'ケーキ・パフェ等のスイーツが売り'),
  ('pet-friendly',    'ペット可',   'other',    10,  true, 'ペット同伴可'),
  ('no-smoking',      '禁煙',       'other',    10,  true, '全席禁煙')
on conflict (slug) do update
  set label = excluded.label,
      category = excluded.category,
      priority = excluded.priority,
      description = excluded.description;
```

## UIでの活用

### ホーム最上部「今、どんなカフェ気分？」

occasion カテゴリのタグを priority 順で並べ、上位8個を主要チップ表示・「もっと見る」で残り。

### 投稿時のタグサジェスト

1. 位置情報からエリアタグを自動サジェスト（別カテゴリ）
2. **occasion タグを最初に提示**（デフォルト効果）
3. mood タグを次に提示
4. other タグは折りたたみ

### 検索フィルタ

- 「気分で絞る」→ occasion のみ
- 「雰囲気で絞る」→ mood のみ
- 「設備で絞る」→ other のみ
- 選択のパラドックス回避のため、各カテゴリ最大7個まで表示

## メンテナンス方針

- **occasion タグは慎重に追加** — 幹A の中核なので乱造しない
- **ユーザー投稿タグ（is_curated=false）が一定利用数を超えたら is_curated 昇格を検討**
- **priority は 10 / 50 / 100 の3値のみ** — 細かい調整はUI側のロジックで
- **削除時の影響:** `post_tags` の CASCADE で該当タグ付き投稿からタグが外れる
