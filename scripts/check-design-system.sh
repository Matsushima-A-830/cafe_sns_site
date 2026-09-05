#!/usr/bin/env bash
# デザインシステムの禁止パターン検査。
# ルールの出典: docs/design/design-system.md / CLAUDE.md
#
# 引数でファイルを渡すとそれだけを検査する (lefthook の staged_files 用)。
# 引数なしなら app/ components/ を全走査する (CI 用)。
set -uo pipefail

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  mapfile -t files < <(find app components -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.css' \) 2>/dev/null)
fi

[ "${#files[@]}" -eq 0 ] && exit 0

status=0

# $1: 説明, $2: 正規表現, $3: 代替案
check() {
  local label="$1" pattern="$2" hint="$3" hits
  hits=$(grep -nE "$pattern" "${files[@]}" 2>/dev/null) || return 0
  echo "✗ ${label}"
  echo "${hits}" | sed 's/^/    /'
  echo "    → ${hint}"
  echo
  status=1
}

# 1. #000 系 (design-system.md 3. 禁止色)
check '#000 系の色は使用禁止' \
  '(text|bg|border|ring|fill|stroke|from|via|to)-black\b|black/[0-9]|#000\b|#000000\b' \
  'text-foreground / bg-brown-900 を使う'

# 2. インライン style (design-system.md 5. 記述ルール)
check 'インライン style は使用禁止' \
  'style=\{' \
  'Tailwind クラスで表現する'

# 3. 余白は 8 の倍数 (例外 1=4px / 3=12px)
#    許可: 0 1 2 3 4 6 8 10 12 14 16 20 24
#    w-5 h-5 のようなサイズ系は対象外 (アイコン20pxは許可されている)
check '余白ユーティリティが 8 の倍数ではない' \
  '(^|[^a-zA-Z0-9])-?(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(5|7|9|11|13|15|17|18|19|21|22|23)([^0-9]|$)' \
  '0/1/2/3/4/6/8/10/12/14/16/20/24 のいずれかにする'

# 4. 余白の任意値 (8の倍数でも原則避ける)
check '余白に任意値を使っている' \
  '(^|[^a-zA-Z0-9])-?(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y)-\[' \
  '許可された余白スケールで表現する'

# 5. フォントサイズの任意値
check 'text-[...] の任意サイズは使用禁止' \
  'text-\[[0-9]' \
  'text-xs/sm/base/lg/xl/2xl/3xl/4xl を使う'

if [ "$status" -ne 0 ]; then
  echo "デザインシステム違反が見つかりました。詳細: docs/design/design-system.md"
fi

exit "$status"
