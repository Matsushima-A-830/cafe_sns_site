# NGワード初期セット（MVP）

`ng_words` テーブルに投入する初期辞書。[pending-items B4](../product/pending-items.md#b4-ngワード辞書の初期セット-決定2026-09-21) の決定に基づき、OSSの日本語NGワードリストを参考にした代表的なサブセットを初期投入する。**網羅を狙わず、運営が [S_ADMIN_NG_WORDS](../architecture/routing.md) から随時追加・調整する運用を前提**にする。

## 一致方式

大文字小文字を無視した単純な部分一致（[tables.md #ng_words](../architecture/data-model/tables.md#ng_words) の `check_ng_words()`）。語境界一致・表記ゆれ（全角/半角、伏字）の吸収はスコープ外（将来検討）。

## severity の運用

- `block`: 投稿・コメントを保存拒否（`NG_WORD_DETECTED`）
- `warn`: MVPでは検出しても保存は妨げない（[D49](../product/pending-items.md#d49-ng_words-severitywarn-の運営レビューキュー送りを見送り) で運営レビューキュー送りを見送ったため）。将来の運用拡張に備えて種を残す

## 初期セット

| word | severity | category | 意図 |
|---|---|---|---|
| 死ね | block | harassment | 直接的な加害・脅迫表現 |
| 殺す | block | harassment | 直接的な加害・脅迫表現 |
| きもい | warn | harassment | 侮辱表現（文脈次第で許容されうるため warn） |
| うざい | warn | harassment | 侮辱表現 |
| ぶす | warn | harassment | 容姿への侮辱 |
| デブ | warn | harassment | 容姿への侮辱 |
| 消えろ | warn | harassment | 攻撃的表現 |
| 出会い系 | block | adult | 未成年メインターゲットへの勧誘対策 |
| 援助交際 | block | adult | 違法行為の勧誘 |
| パパ活 | block | adult | 未成年への勧誘対策 |
| ライン交換 | warn | adult | 個人間連絡先交換の勧誘（文脈次第） |
| セフレ | block | adult | 性的関係の勧誘 |
| 儲かる副業 | block | spam | 詐欺的副業勧誘の定型句 |
| 今すぐ稼げる | block | spam | 詐欺的副業勧誘の定型句 |
| 副業紹介 | warn | spam | 勧誘の可能性がある定型句 |
| 相互フォロー | warn | spam | フォロー乞い（スパム的な定型句） |
| クリックして | warn | spam | フィッシング誘導の定型句 |
| 無料プレゼント | warn | spam | 景品詐欺の定型句 |
| 個人情報 | warn | other | 個人情報の書き込み・要求への注意喚起 |
| 住所を教えて | block | other | 未成年への個人情報要求対策 |

## 運用メモ

- `word` は `UNIQUE` 制約があるため重複追加はエラーになる（S_ADMIN_NG_WORDS 側で表示）
- カテゴリは表示・将来のフィルタ用途のためのラベルで、MVPの検出ロジック自体はカテゴリを見ない（`severity` のみで判定）
- 誤検出（false positive）が運用上問題になった場合は S_ADMIN_NG_WORDS から削除する
