-- areas.center_location の座標45件を投入する（pending-items A3）。
-- 座標は Google Geocoding API（"東京都 {label}" で問い合わせ）から取得。
-- 20260905120400_seed_master_data.sql は書き換えず、forward-only の UPDATE で埋める。

update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7537719, 35.6940309), 4326)::extensions.geography where code = 'JP-13-chiyoda-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7719892, 35.6706392), 4326)::extensions.geography where code = 'JP-13-chuo-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7515077, 35.65808130000001), 4326)::extensions.geography where code = 'JP-13-minato-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7033559, 35.6938253), 4326)::extensions.geography where code = 'JP-13-shinjuku-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7524369, 35.7078686), 4326)::extensions.geography where code = 'JP-13-bunkyo-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7802043, 35.7125736), 4326)::extensions.geography where code = 'JP-13-taito-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.8016393, 35.7107479), 4326)::extensions.geography where code = 'JP-13-sumida-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.8174521, 35.6727748), 4326)::extensions.geography where code = 'JP-13-koto-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7298661, 35.6096296), 4326)::extensions.geography where code = 'JP-13-shinagawa-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6980773, 35.6414529), 4326)::extensions.geography where code = 'JP-13-meguro-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7169362, 35.5620838), 4326)::extensions.geography where code = 'JP-13-ota-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.653582, 35.6468095), 4326)::extensions.geography where code = 'JP-13-setagaya-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.703795, 35.6619707), 4326)::extensions.geography where code = 'JP-13-shibuya-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6637591, 35.7075331), 4326)::extensions.geography where code = 'JP-13-nakano-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6355204, 35.6994705), 4326)::extensions.geography where code = 'JP-13-suginami-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7168209, 35.7262664), 4326)::extensions.geography where code = 'JP-13-toshima-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7337701, 35.7528727), 4326)::extensions.geography where code = 'JP-13-kita-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7834758, 35.7359339), 4326)::extensions.geography where code = 'JP-13-arakawa-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7092786, 35.7512311), 4326)::extensions.geography where code = 'JP-13-itabashi-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6516675, 35.7356446), 4326)::extensions.geography where code = 'JP-13-nerima-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.8044129, 35.775017), 4326)::extensions.geography where code = 'JP-13-adachi-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.8472243, 35.7432853), 4326)::extensions.geography where code = 'JP-13-katsushika-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.8681899, 35.7067011), 4326)::extensions.geography where code = 'JP-13-edogawa-ku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.707743, 35.667355), 4326)::extensions.geography where code = 'JP-13-omotesando';
-- 原宿・神宮前は「東京都 {label}」問い合わせだと同一座標になる（原宿は神宮前の通称で行政地名としては別立てでないため）。
-- 原宿駅の座標を使って区別する
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7024662, 35.6700901), 4326)::extensions.geography where code = 'JP-13-harajuku';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7153917, 35.6461371), 4326)::extensions.geography where code = 'JP-13-ebisu';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7042207, 35.6505465), 4326)::extensions.geography where code = 'JP-13-daikanyama';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.709008, 35.6699682), 4326)::extensions.geography where code = 'JP-13-jingumae';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6924137, 35.6598601), 4326)::extensions.geography where code = 'JP-13-shoto';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7032633, 35.6911784), 4326)::extensions.geography where code = 'JP-13-shinjuku-sanchome';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7402946, 35.70145979999999), 4326)::extensions.geography where code = 'JP-13-kagurazaka';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7026251, 35.6387161), 4326)::extensions.geography where code = 'JP-13-nakameguro';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6668931, 35.6105884), 4326)::extensions.geography where code = 'JP-13-jiyugaoka';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.6698627, 35.665786), 4326)::extensions.geography where code = 'JP-13-shimokitazawa';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.667531, 35.6412539), 4326)::extensions.geography where code = 'JP-13-sangenjaya';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.626083, 35.6125332), 4326)::extensions.geography where code = 'JP-13-futakotamagawa';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7336426, 35.6571011), 4326)::extensions.geography where code = 'JP-13-azabu';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7345469, 35.6618586), 4326)::extensions.geography where code = 'JP-13-roppongi';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7281611, 35.6443746), 4326)::extensions.geography where code = 'JP-13-shirokane';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7664859, 35.6712228), 4326)::extensions.geography where code = 'JP-13-ginza';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7741538, 35.6811836), 4326)::extensions.geography where code = 'JP-13-nihonbashi';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7958849, 35.7185858), 4326)::extensions.geography where code = 'JP-13-asakusa';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7920494, 35.7021284), 4326)::extensions.geography where code = 'JP-13-kuramae';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.7690417, 35.7250389), 4326)::extensions.geography where code = 'JP-13-yanaka';
update public.areas set center_location = extensions.st_setsrid(extensions.st_makepoint(139.5802054, 35.704096), 4326)::extensions.geography where code = 'JP-13-kichijoji';
