-- ============================================
-- マスタデータ: エリア45件 / 厳選タグ30件 / バッジ20件
--
--   docs/seed/areas-initial-set.md
--   docs/seed/curated-tags-initial-set.md
--   docs/seed/badges-initial-set.md
--
-- seed.sql ではなくマイグレーションに置く理由:
--   マスタ3テーブルはアプリの動作に必須で、本番にも無いと画面が成立しない。
--   一方 supabase/seed.sql は `supabase db reset`（ローカル）でしか実行されず、
--   本番の経路である `db push` は流さない。`--include-seed` を付けても
--   未適用マイグレーションが0件だと seed をスキップするため、マスタの変更が
--   本番に届かない。承認ゲート付きの db push に確実に乗せるためマイグレーションにする。
--
-- マスタを変更する時は、このファイルを編集せず**新しいマイグレーションを追加する**
-- （forward-only）。ローカルは `pnpm db:reset` で再構築される。
-- ============================================

-- ============================================
-- areas: 東京23区（level='ward'）
--   center_location は 45件ぶんの座標が未収集のため NULL のまま（pending-items A3）
-- ============================================

insert into public.areas (code, prefecture_code, slug, label, label_kana, level, parent_code, priority) values
  ('JP-13-chiyoda-ku',    'JP-13', 'chiyoda-ku',    '千代田区', 'チヨダク',     'ward', null, 50),
  ('JP-13-chuo-ku',       'JP-13', 'chuo-ku',       '中央区',   'チュウオウク', 'ward', null, 50),
  ('JP-13-minato-ku',     'JP-13', 'minato-ku',     '港区',     'ミナトク',     'ward', null, 50),
  ('JP-13-shinjuku-ku',   'JP-13', 'shinjuku-ku',   '新宿区',   'シンジュクク', 'ward', null, 50),
  ('JP-13-bunkyo-ku',     'JP-13', 'bunkyo-ku',     '文京区',   'ブンキョウク', 'ward', null, 50),
  ('JP-13-taito-ku',      'JP-13', 'taito-ku',      '台東区',   'タイトウク',   'ward', null, 50),
  ('JP-13-sumida-ku',     'JP-13', 'sumida-ku',     '墨田区',   'スミダク',     'ward', null, 50),
  ('JP-13-koto-ku',       'JP-13', 'koto-ku',       '江東区',   'コウトウク',   'ward', null, 50),
  ('JP-13-shinagawa-ku',  'JP-13', 'shinagawa-ku',  '品川区',   'シナガワク',   'ward', null, 50),
  ('JP-13-meguro-ku',     'JP-13', 'meguro-ku',     '目黒区',   'メグロク',     'ward', null, 50),
  ('JP-13-ota-ku',        'JP-13', 'ota-ku',        '大田区',   'オオタク',     'ward', null, 50),
  ('JP-13-setagaya-ku',   'JP-13', 'setagaya-ku',   '世田谷区', 'セタガヤク',   'ward', null, 50),
  ('JP-13-shibuya-ku',    'JP-13', 'shibuya-ku',    '渋谷区',   'シブヤク',     'ward', null, 50),
  ('JP-13-nakano-ku',     'JP-13', 'nakano-ku',     '中野区',   'ナカノク',     'ward', null, 50),
  ('JP-13-suginami-ku',   'JP-13', 'suginami-ku',   '杉並区',   'スギナミク',   'ward', null, 50),
  ('JP-13-toshima-ku',    'JP-13', 'toshima-ku',    '豊島区',   'トシマク',     'ward', null, 50),
  ('JP-13-kita-ku',       'JP-13', 'kita-ku',       '北区',     'キタク',       'ward', null, 50),
  ('JP-13-arakawa-ku',    'JP-13', 'arakawa-ku',    '荒川区',   'アラカワク',   'ward', null, 50),
  ('JP-13-itabashi-ku',   'JP-13', 'itabashi-ku',   '板橋区',   'イタバシク',   'ward', null, 50),
  ('JP-13-nerima-ku',     'JP-13', 'nerima-ku',     '練馬区',   'ネリマク',     'ward', null, 50),
  ('JP-13-adachi-ku',     'JP-13', 'adachi-ku',     '足立区',   'アダチク',     'ward', null, 50),
  ('JP-13-katsushika-ku', 'JP-13', 'katsushika-ku', '葛飾区',   'カツシカク',   'ward', null, 50),
  ('JP-13-edogawa-ku',    'JP-13', 'edogawa-ku',    '江戸川区', 'エドガワク',   'ward', null, 50)
-- is_active は意図的に更新しない。廃止したエリアを is_active=false にする運用
-- （tables.md #areas）を、seed の再実行で巻き戻さないため
on conflict (code) do update
  set label       = excluded.label,
      label_kana  = excluded.label_kana,
      level       = excluded.level,
      parent_code = excluded.parent_code,
      priority    = excluded.priority;

-- ============================================
-- areas: 主要副地域・人気エリア（level='sub_area'）
--   吉祥寺だけ武蔵野市（23区外）なので parent_code は NULL
-- ============================================

insert into public.areas (code, prefecture_code, slug, label, label_kana, level, parent_code, priority) values
  ('JP-13-omotesando',        'JP-13', 'omotesando',        '表参道',     'オモテサンドウ',         'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-harajuku',          'JP-13', 'harajuku',          '原宿',       'ハラジュク',             'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-ebisu',             'JP-13', 'ebisu',             '恵比寿',     'エビス',                 'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-daikanyama',        'JP-13', 'daikanyama',        '代官山',     'ダイカンヤマ',           'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-jingumae',          'JP-13', 'jingumae',          '神宮前',     'ジングウマエ',           'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-shoto',             'JP-13', 'shoto',             '松濤',       'ショウトウ',             'sub_area', 'JP-13-shibuya-ku',  100),
  ('JP-13-shinjuku-sanchome', 'JP-13', 'shinjuku-sanchome', '新宿三丁目', 'シンジュクサンチョウメ', 'sub_area', 'JP-13-shinjuku-ku', 100),
  ('JP-13-kagurazaka',        'JP-13', 'kagurazaka',        '神楽坂',     'カグラザカ',             'sub_area', 'JP-13-shinjuku-ku', 100),
  ('JP-13-nakameguro',        'JP-13', 'nakameguro',        '中目黒',     'ナカメグロ',             'sub_area', 'JP-13-meguro-ku',   100),
  ('JP-13-jiyugaoka',         'JP-13', 'jiyugaoka',         '自由が丘',   'ジユウガオカ',           'sub_area', 'JP-13-meguro-ku',   100),
  ('JP-13-shimokitazawa',     'JP-13', 'shimokitazawa',     '下北沢',     'シモキタザワ',           'sub_area', 'JP-13-setagaya-ku', 100),
  ('JP-13-sangenjaya',        'JP-13', 'sangenjaya',        '三軒茶屋',   'サンゲンジャヤ',         'sub_area', 'JP-13-setagaya-ku', 100),
  ('JP-13-futakotamagawa',    'JP-13', 'futakotamagawa',    '二子玉川',   'フタコタマガワ',         'sub_area', 'JP-13-setagaya-ku', 100),
  ('JP-13-azabu',             'JP-13', 'azabu',             '麻布',       'アザブ',                 'sub_area', 'JP-13-minato-ku',   100),
  ('JP-13-roppongi',          'JP-13', 'roppongi',          '六本木',     'ロッポンギ',             'sub_area', 'JP-13-minato-ku',   100),
  ('JP-13-shirokane',         'JP-13', 'shirokane',         '白金',       'シロカネ',               'sub_area', 'JP-13-minato-ku',   100),
  ('JP-13-ginza',             'JP-13', 'ginza',             '銀座',       'ギンザ',                 'sub_area', 'JP-13-chuo-ku',     100),
  ('JP-13-nihonbashi',        'JP-13', 'nihonbashi',        '日本橋',     'ニホンバシ',             'sub_area', 'JP-13-chuo-ku',     100),
  ('JP-13-asakusa',           'JP-13', 'asakusa',           '浅草',       'アサクサ',               'sub_area', 'JP-13-taito-ku',    100),
  ('JP-13-kuramae',           'JP-13', 'kuramae',           '蔵前',       'クラマエ',               'sub_area', 'JP-13-taito-ku',    100),
  ('JP-13-yanaka',            'JP-13', 'yanaka',            '谷中',       'ヤナカ',                 'sub_area', 'JP-13-taito-ku',    100),
  ('JP-13-kichijoji',         'JP-13', 'kichijoji',         '吉祥寺',     'キチジョウジ',           'sub_area', null,                100)
-- is_active は区と同じ理由で更新しない
on conflict (code) do update
  set label       = excluded.label,
      label_kana  = excluded.label_kana,
      level       = excluded.level,
      parent_code = excluded.parent_code,
      priority    = excluded.priority;

-- ============================================
-- tags: 厳選タグ30個
--   occasion 15 / mood 10 / other 5。area カテゴリは areas マスタが正なので作らない
-- ============================================

insert into public.tags (slug, label, category, priority, is_curated, description) values
  -- occasion（シーン / 気分）— 幹A の中核
  ('solo-time',      'ひとり時間',             'occasion', 100, true, '一人でゆっくり過ごしたい時'),
  ('morning-cafe',   '朝カフェ',               'occasion', 100, true, '朝の時間に訪れたい店'),
  ('morning-open',   'モーニング',             'occasion', 100, true, 'モーニングメニューがある店'),
  ('night-cafe',     '夜カフェ',               'occasion', 100, true, '夜遅くまで営業、静かに過ごせる'),
  ('date',           'デート',                 'occasion', 100, true, 'デート向き、雰囲気のよい店'),
  ('girls-meetup',   '女子会',                 'occasion', 100, true, '話しやすい、映えるメニュー'),
  ('study',          '勉強',                   'occasion', 100, true, '勉強に集中できる環境'),
  ('work',           'ワーク',                 'occasion', 100, true, 'ノマドワーク向き'),
  ('wifi-available', 'Wi-Fi',                  'occasion', 100, true, 'Wi-Fi完備'),
  ('power-outlet',   '電源',                   'occasion', 100, true, '電源席あり'),
  ('rainy-day',      '雨の日',                 'occasion', 100, true, '雨の日にこもりたい店'),
  ('relax',          'のんびり',               'occasion', 100, true, '時間を気にせずくつろげる'),
  ('early-open',     '早朝営業',               'occasion', 100, true, '7時前オープン'),
  ('late-open',      '夜遅くまで営業',         'occasion', 100, true, '22時以降営業'),
  ('kids-welcome',   '子連れOK',               'occasion', 100, true, '子連れ歓迎、ベビーカー可'),

  -- mood（雰囲気）
  ('quiet',          '静か',                   'mood',      50, true, '静かに過ごせる'),
  ('stylish',        'おしゃれ',               'mood',      50, true, 'インテリアが凝っている'),
  ('retro',          'レトロ',                 'mood',      50, true, '昭和・大正の趣'),
  ('warm-wood',      '木のぬくもり',           'mood',      50, true, '木材を活かした温かい空間'),
  ('antique',        'アンティーク',           'mood',      50, true, 'アンティーク調'),
  ('mid-century',    'ミッドセンチュリー',     'mood',      50, true, '20世紀中葉のデザイン'),
  ('japanese',       '和カフェ',               'mood',      50, true, '和のテイスト'),
  ('book-cafe',      'ブックカフェ',           'mood',      50, true, '本が読める、本が置いてある'),
  ('garden',         '庭付き',                 'mood',      50, true, '庭・中庭がある'),
  ('terrace',        'テラス',                 'mood',      50, true, 'テラス席あり'),

  -- other（こだわり条件）
  ('roastery',       '自家焙煎',               'other',     10, true, '店内で焙煎'),
  ('specialty',      'スペシャルティコーヒー', 'other',     10, true, '高品質コーヒー専門'),
  ('sweets',         'スイーツ充実',           'other',     10, true, 'ケーキ・パフェ等のスイーツが売り'),
  ('pet-friendly',   'ペット可',               'other',     10, true, 'ペット同伴可'),
  ('no-smoking',     '禁煙',                   'other',     10, true, '全席禁煙')
on conflict (slug) do update
  set label       = excluded.label,
      category    = excluded.category,
      priority    = excluded.priority,
      is_curated  = excluded.is_curated,
      description = excluded.description;

-- ============================================
-- badges: MVP 20個
--
-- criteria の type 一覧（判定の実装は lib/badges/rules.ts）:
--   post_count               累計投稿数
--   distinct_area_count      投稿したエリア数。scope が areas 側の絞り込み条件
--   post_count_with_tag      特定タグ付き投稿の累計
--   post_count_with_tags_or  いずれかのタグが付いた投稿の累計
--   distinct_scene_tag_count 投稿に使った異なるシーンタグ数
--   regular_customer_count   常連認定を受けた店舗数
--   follower_count           フォロワー数
--   likes_received           受け取ったいいね累計
--   likes_given              送ったいいね累計
-- ============================================

insert into public.badges (code, name, description, criteria) values
  -- 投稿系
  ('POST_FIRST', 'はじめての一杯', '初めての投稿を公開した',
   '{"type":"post_count","threshold":1}'),
  ('POST_10', 'カフェレポーター', '累計10投稿を達成した',
   '{"type":"post_count","threshold":10}'),
  ('POST_50', 'カフェジャーナリスト', '累計50投稿を達成した',
   '{"type":"post_count","threshold":50}'),
  ('POST_100', 'カフェセンパイ', '累計100投稿を達成した',
   '{"type":"post_count","threshold":100}'),

  -- エリア系（制覇マップ連動）。副地域投稿でも親の区が記録されるため level='ward' で数える
  ('AREA_3', '街歩き入門', '3つの区で投稿した',
   '{"type":"distinct_area_count","scope":{"level":"ward"},"threshold":3}'),
  ('AREA_10', '街歩き上手', '10の区で投稿した',
   '{"type":"distinct_area_count","scope":{"level":"ward"},"threshold":10}'),
  ('AREA_TOKYO_23', '東京23区制覇', '東京23区すべてで投稿した',
   '{"type":"distinct_area_count","scope":{"level":"ward","prefecture_code":"JP-13"},"threshold":23}'),

  -- シーン系（幹A の中核）
  ('SCENE_MORNING', '朝カフェマスター', '朝カフェタグの投稿を10件公開した',
   '{"type":"post_count_with_tag","tag_slug":"morning-cafe","threshold":10}'),
  ('SCENE_NIGHT', '夜カフェ探検家', '夜カフェタグの投稿を10件公開した',
   '{"type":"post_count_with_tag","tag_slug":"night-cafe","threshold":10}'),
  ('SCENE_SOLO', 'ひとり時間マスター', 'ひとり時間タグの投稿を10件公開した',
   '{"type":"post_count_with_tag","tag_slug":"solo-time","threshold":10}'),
  ('SCENE_RAINY', '雨の日マスター', '雨の日タグの投稿を5件公開した',
   '{"type":"post_count_with_tag","tag_slug":"rainy-day","threshold":5}'),
  ('SCENE_WORK', '集中カフェマスター', 'ワーク or 勉強タグの投稿を10件公開した',
   '{"type":"post_count_with_tags_or","tag_slugs":["work","study"],"threshold":10}'),
  ('SCENE_EXPLORER', 'シーン開拓者', '5つ以上の異なるシーンタグで投稿した',
   '{"type":"distinct_scene_tag_count","category":"occasion","threshold":5}'),

  -- 行きつけ系（幹C の中核）
  ('REGULAR_FIRST', 'はじめての行きつけ', '常連認定を1件獲得した',
   '{"type":"regular_customer_count","threshold":1}'),
  ('REGULAR_3', '行きつけコレクター', '3店で常連認定を獲得した',
   '{"type":"regular_customer_count","threshold":3}'),
  ('REGULAR_5', 'カフェの顔', '5店で常連認定を獲得した',
   '{"type":"regular_customer_count","threshold":5}'),
  ('REGULAR_VIP', 'カフェのVIP', '10店で常連認定を獲得した',
   '{"type":"regular_customer_count","threshold":10}'),

  -- コミュニティ系
  ('COM_10_FOLLOWERS', 'フォロワー10', 'フォロワーが10人になった',
   '{"type":"follower_count","threshold":10}'),
  ('COM_100_LIKES', 'いいねの受け手', '累計100いいねを獲得した',
   '{"type":"likes_received","threshold":100}'),
  ('COM_FIRST_LIKE_GIVEN', 'はじめての返報性', '他の人の投稿に初めていいねした',
   '{"type":"likes_given","threshold":1}')
on conflict (code) do update
  set name        = excluded.name,
      description = excluded.description,
      criteria    = excluded.criteria;
