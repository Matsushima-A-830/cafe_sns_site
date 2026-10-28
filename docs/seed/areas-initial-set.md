# エリア初期セット（MVP 45エリア）

`areas` テーブルに投入する初期データ。**東京中心のMVPからスタート、全国は段階的に拡張**。

> **✅ 座標データは2026-09-26に投入済み（[pending-items A3](../product/pending-items.md) 解消済み）。**
> 以下の表自体は `code` / `slug` / `label` / `parent_code` のみを載せているが、`areas.center_location`（緯度経度）は
> `supabase/migrations/20260926214427_backfill_area_coordinates.sql` で全45件に投入済み。
> `S_MAP` のエリア表示は動くようになったが、新規カフェ登録時の `area_code` 自動判定・`S_ONBOARD_AREA` の
> 「現在地から検索」は別途 `ST_Distance` によるエリア判定ロジックの実装が要るため、まだ動かない（意図的にスコープ外）。

## コード体系（ISO 3166-2 準拠）

```
JP-{都道府県コード}-{エリアslug}

例:
  JP-13-shibuya-ku       (東京都・渋谷区)
  JP-13-omotesando       (東京都・表参道)
  JP-27-umeda            (大阪府・梅田)
```

**都道府県コード対応表（主要）:**

| 都道府県 | ISO 3166-2 |
| -------- | ---------- |
| 北海道   | JP-01      |
| 東京都   | JP-13      |
| 神奈川県 | JP-14      |
| 大阪府   | JP-27      |
| 京都府   | JP-26      |
| 福岡県   | JP-40      |
| 沖縄県   | JP-47      |

## MVP 初期セット（東京 45エリア）

### 東京23区（23個、`level='ward'`、priority=50）

`parent_code = NULL`（トップレベル）。副地域が下に紐づく。

| code                  | slug          | label    | 備考 |
| --------------------- | ------------- | -------- | ---- |
| `JP-13-chiyoda-ku`    | chiyoda-ku    | 千代田区 |      |
| `JP-13-chuo-ku`       | chuo-ku       | 中央区   |      |
| `JP-13-minato-ku`     | minato-ku     | 港区     |      |
| `JP-13-shinjuku-ku`   | shinjuku-ku   | 新宿区   |      |
| `JP-13-bunkyo-ku`     | bunkyo-ku     | 文京区   |      |
| `JP-13-taito-ku`      | taito-ku      | 台東区   |      |
| `JP-13-sumida-ku`     | sumida-ku     | 墨田区   |      |
| `JP-13-koto-ku`       | koto-ku       | 江東区   |      |
| `JP-13-shinagawa-ku`  | shinagawa-ku  | 品川区   |      |
| `JP-13-meguro-ku`     | meguro-ku     | 目黒区   |      |
| `JP-13-ota-ku`        | ota-ku        | 大田区   |      |
| `JP-13-setagaya-ku`   | setagaya-ku   | 世田谷区 |      |
| `JP-13-shibuya-ku`    | shibuya-ku    | 渋谷区   |      |
| `JP-13-nakano-ku`     | nakano-ku     | 中野区   |      |
| `JP-13-suginami-ku`   | suginami-ku   | 杉並区   |      |
| `JP-13-toshima-ku`    | toshima-ku    | 豊島区   |      |
| `JP-13-kita-ku`       | kita-ku       | 北区     |      |
| `JP-13-arakawa-ku`    | arakawa-ku    | 荒川区   |      |
| `JP-13-itabashi-ku`   | itabashi-ku   | 板橋区   |      |
| `JP-13-nerima-ku`     | nerima-ku     | 練馬区   |      |
| `JP-13-adachi-ku`     | adachi-ku     | 足立区   |      |
| `JP-13-katsushika-ku` | katsushika-ku | 葛飾区   |      |
| `JP-13-edogawa-ku`    | edogawa-ku    | 江戸川区 |      |

### 主要副地域・人気エリア（22個、`level='sub_area'`、priority=100）

`parent_code` で 23区に紐づく。若者・カフェ好き層に人気のエリアを優先。

| code                      | slug              | label      | parent_code              |
| ------------------------- | ----------------- | ---------- | ------------------------ |
| `JP-13-omotesando`        | omotesando        | 表参道     | JP-13-shibuya-ku         |
| `JP-13-harajuku`          | harajuku          | 原宿       | JP-13-shibuya-ku         |
| `JP-13-ebisu`             | ebisu             | 恵比寿     | JP-13-shibuya-ku         |
| `JP-13-daikanyama`        | daikanyama        | 代官山     | JP-13-shibuya-ku         |
| `JP-13-jingumae`          | jingumae          | 神宮前     | JP-13-shibuya-ku         |
| `JP-13-shoto`             | shoto             | 松濤       | JP-13-shibuya-ku         |
| `JP-13-shinjuku-sanchome` | shinjuku-sanchome | 新宿三丁目 | JP-13-shinjuku-ku        |
| `JP-13-kagurazaka`        | kagurazaka        | 神楽坂     | JP-13-shinjuku-ku        |
| `JP-13-nakameguro`        | nakameguro        | 中目黒     | JP-13-meguro-ku          |
| `JP-13-jiyugaoka`         | jiyugaoka         | 自由が丘   | JP-13-meguro-ku          |
| `JP-13-shimokitazawa`     | shimokitazawa     | 下北沢     | JP-13-setagaya-ku        |
| `JP-13-sangenjaya`        | sangenjaya        | 三軒茶屋   | JP-13-setagaya-ku        |
| `JP-13-futakotamagawa`    | futakotamagawa    | 二子玉川   | JP-13-setagaya-ku        |
| `JP-13-azabu`             | azabu             | 麻布       | JP-13-minato-ku          |
| `JP-13-roppongi`          | roppongi          | 六本木     | JP-13-minato-ku          |
| `JP-13-shirokane`         | shirokane         | 白金       | JP-13-minato-ku          |
| `JP-13-ginza`             | ginza             | 銀座       | JP-13-chuo-ku            |
| `JP-13-nihonbashi`        | nihonbashi        | 日本橋     | JP-13-chuo-ku            |
| `JP-13-asakusa`           | asakusa           | 浅草       | JP-13-taito-ku           |
| `JP-13-kuramae`           | kuramae           | 蔵前       | JP-13-taito-ku           |
| `JP-13-yanaka`            | yanaka            | 谷中       | JP-13-taito-ku           |
| `JP-13-kichijoji`         | kichijoji         | 吉祥寺     | NULL（武蔵野市、23区外） |

**注意:** 吉祥寺は武蔵野市のため 23区の親を持たない（`parent_code = NULL` だが `level='sub_area'`）。**「東京23区制覇」の母数は `parent_code IS NULL` ではなく `level='ward'` で数える**（吉祥寺の混入を防ぐため）。将来的に `JP-13-musashino-shi`（`level='ward'`）を追加する場合は parent を張り直す。

## Seed SQL 例

```sql
-- 23区（level='ward'）
insert into public.areas (code, prefecture_code, slug, label, label_kana, level, parent_code, priority) values
  ('JP-13-chiyoda-ku',   'JP-13', 'chiyoda-ku',   '千代田区', 'チヨダク',   'ward',  null, 50),
  ('JP-13-chuo-ku',      'JP-13', 'chuo-ku',      '中央区',   'チュウオウク', 'ward',  null, 50),
  ('JP-13-minato-ku',    'JP-13', 'minato-ku',    '港区',     'ミナトク',   'ward',  null, 50),
  ('JP-13-shinjuku-ku',  'JP-13', 'shinjuku-ku',  '新宿区',   'シンジュクク', 'ward',  null, 50),
  ('JP-13-bunkyo-ku',    'JP-13', 'bunkyo-ku',    '文京区',   'ブンキョウク', 'ward',  null, 50),
  ('JP-13-taito-ku',     'JP-13', 'taito-ku',     '台東区',   'タイトウク',  'ward',  null, 50),
  ('JP-13-sumida-ku',    'JP-13', 'sumida-ku',    '墨田区',   'スミダク',   'ward',  null, 50),
  ('JP-13-koto-ku',      'JP-13', 'koto-ku',      '江東区',   'コウトウク',  'ward',  null, 50),
  ('JP-13-shinagawa-ku', 'JP-13', 'shinagawa-ku', '品川区',   'シナガワク',  'ward',  null, 50),
  ('JP-13-meguro-ku',    'JP-13', 'meguro-ku',    '目黒区',   'メグロク',   'ward',  null, 50),
  ('JP-13-ota-ku',       'JP-13', 'ota-ku',       '大田区',   'オオタク',   'ward',  null, 50),
  ('JP-13-setagaya-ku',  'JP-13', 'setagaya-ku',  '世田谷区', 'セタガヤク',  'ward',  null, 50),
  ('JP-13-shibuya-ku',   'JP-13', 'shibuya-ku',   '渋谷区',   'シブヤク',   'ward',  null, 50),
  ('JP-13-nakano-ku',    'JP-13', 'nakano-ku',    '中野区',   'ナカノク',   'ward',  null, 50),
  ('JP-13-suginami-ku',  'JP-13', 'suginami-ku',  '杉並区',   'スギナミク',  'ward',  null, 50),
  ('JP-13-toshima-ku',   'JP-13', 'toshima-ku',   '豊島区',   'トシマク',   'ward',  null, 50),
  ('JP-13-kita-ku',      'JP-13', 'kita-ku',      '北区',     'キタク',    'ward',  null, 50),
  ('JP-13-arakawa-ku',   'JP-13', 'arakawa-ku',   '荒川区',   'アラカワク',  'ward',  null, 50),
  ('JP-13-itabashi-ku',  'JP-13', 'itabashi-ku',  '板橋区',   'イタバシク',  'ward',  null, 50),
  ('JP-13-nerima-ku',    'JP-13', 'nerima-ku',    '練馬区',   'ネリマク',   'ward',  null, 50),
  ('JP-13-adachi-ku',    'JP-13', 'adachi-ku',    '足立区',   'アダチク',   'ward',  null, 50),
  ('JP-13-katsushika-ku','JP-13', 'katsushika-ku','葛飾区',   'カツシカク',  'ward',  null, 50),
  ('JP-13-edogawa-ku',   'JP-13', 'edogawa-ku',   '江戸川区', 'エドガワク',  'ward',  null, 50)
on conflict (code) do update
  set label = excluded.label, label_kana = excluded.label_kana,
      level = excluded.level, priority = excluded.priority;

-- 主要副地域（level='sub_area'、parent_code 付き、priority=100）
insert into public.areas (code, prefecture_code, slug, label, label_kana, level, parent_code, priority) values
  ('JP-13-omotesando',         'JP-13', 'omotesando',         '表参道',       'オモテサンドウ',   'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-harajuku',           'JP-13', 'harajuku',           '原宿',         'ハラジュク',       'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-ebisu',              'JP-13', 'ebisu',              '恵比寿',       'エビス',           'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-daikanyama',         'JP-13', 'daikanyama',         '代官山',       'ダイカンヤマ',     'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-jingumae',           'JP-13', 'jingumae',           '神宮前',       'ジングウマエ',     'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-shoto',              'JP-13', 'shoto',              '松濤',         'ショウトウ',       'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-shinjuku-sanchome',  'JP-13', 'shinjuku-sanchome',  '新宿三丁目',   'シンジュクサンチョウメ', 'sub_area', 'JP-13-shinjuku-ku', 100),
  ('JP-13-kagurazaka',         'JP-13', 'kagurazaka',         '神楽坂',       'カグラザカ',       'sub_area', 'JP-13-shinjuku-ku', 100),
  ('JP-13-nakameguro',         'JP-13', 'nakameguro',         '中目黒',       'ナカメグロ',       'sub_area', 'JP-13-meguro-ku',   100),
  ('JP-13-jiyugaoka',          'JP-13', 'jiyugaoka',          '自由が丘',     'ジユウガオカ',     'sub_area', 'JP-13-meguro-ku',   100),
  ('JP-13-shimokitazawa',      'JP-13', 'shimokitazawa',      '下北沢',       'シモキタザワ',     'sub_area', 'JP-13-setagaya-ku', 100),
  ('JP-13-sangenjaya',         'JP-13', 'sangenjaya',         '三軒茶屋',     'サンゲンジャヤ',   'sub_area', 'JP-13-setagaya-ku', 100),
  ('JP-13-futakotamagawa',     'JP-13', 'futakotamagawa',     '二子玉川',     'フタコタマガワ',   'sub_area', 'JP-13-setagaya-ku', 100),
  ('JP-13-azabu',              'JP-13', 'azabu',              '麻布',         'アザブ',           'sub_area', 'JP-13-minato-ku',   100),
  ('JP-13-roppongi',           'JP-13', 'roppongi',           '六本木',       'ロッポンギ',       'sub_area', 'JP-13-minato-ku',   100),
  ('JP-13-shirokane',          'JP-13', 'shirokane',          '白金',         'シロカネ',         'sub_area', 'JP-13-minato-ku',   100),
  ('JP-13-ginza',              'JP-13', 'ginza',              '銀座',         'ギンザ',           'sub_area', 'JP-13-chuo-ku',     100),
  ('JP-13-nihonbashi',         'JP-13', 'nihonbashi',         '日本橋',       'ニホンバシ',       'sub_area', 'JP-13-chuo-ku',     100),
  ('JP-13-asakusa',            'JP-13', 'asakusa',            '浅草',         'アサクサ',         'sub_area', 'JP-13-taito-ku',    100),
  ('JP-13-kuramae',            'JP-13', 'kuramae',            '蔵前',         'クラマエ',         'sub_area', 'JP-13-taito-ku',    100),
  ('JP-13-yanaka',             'JP-13', 'yanaka',             '谷中',         'ヤナカ',           'sub_area', 'JP-13-taito-ku',    100),
  ('JP-13-kichijoji',          'JP-13', 'kichijoji',          '吉祥寺',       'キチジョウジ',     'sub_area', null,                100)
on conflict (code) do update
  set label = excluded.label, label_kana = excluded.label_kana, level = excluded.level,
      parent_code = excluded.parent_code, priority = excluded.priority;
```

## UIでの活用

### 検索フィルタ

- `level='ward'`（23区）を大分類として表示
- 選択後、その配下の副地域（`level='sub_area'`）を展開表示
- 「人気エリアから探す」導線では level を跨いで `priority DESC` 順に並べる（副地域が上位に出る）

### 制覇マップ

- ユーザーが投稿した `area_visits.area_code` を areas テーブルと JOIN
- 「23区制覇」 = `level = 'ward' AND prefecture_code = 'JP-13'` の23件を全訪問
  （`parent_code IS NULL` で数えると吉祥寺が混ざり24件になるため使わない）
- 「渋谷区マスター」 = `parent_code = 'JP-13-shibuya-ku'` を全訪問（副地域 6個）
- 副地域のカフェへ投稿した場合も親の区は訪問済みになる（[data-model/README.md のエリアコードの一貫性](../architecture/data-model/README.md#エリアコードの一貫性) 参照）

### 投稿時のエリア紐付け

- カフェ選択時、そのカフェの `area_code` を自動セット
- カフェ新規登録時は最も近い副地域を候補提示（`ST_Distance` で判定）
- 明確な副地域がない場合は 23区レベルにフォールバック

## 全国展開時の追加方針

MVP 実績から拡張する順序案:
1. **大阪主要エリア** (JP-27-umeda, JP-27-namba, JP-27-nakazakicho 等)
2. **京都主要エリア** (JP-26-shijo-kawaramachi, JP-26-arashiyama 等)
3. **福岡主要エリア** (JP-40-tenjin, JP-40-daimyo 等)
4. **横浜主要エリア** (JP-14-yokohama-city, JP-14-motomachi 等)
5. **その他政令指定都市**
6. **地方主要都市**

## メンテナンス方針

- **既存コード変更禁止** — 変更が必要なら `is_active=false` にして新コードを作る（`area_visits` 等の外部参照が壊れる）
- **副地域の追加は柔軟に** — priority を上位に設定して既存投稿への影響なし
- **重複エリア** — 明らかな地理的重複がある場合は片方を非アクティブに
