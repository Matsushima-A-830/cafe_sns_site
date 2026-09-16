#!/usr/bin/env bash
# 実装状況ボード (docs/implementation-board.html) の指標を数える。
# 手で数えると必ずズレるので、更新時は必ずこのスクリプトの出力を使う。
#
# 使い方: bash scripts/board-stats.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

INDEX=docs/design/wireframes/README.md
TABLES_DOC=docs/architecture/data-model/tables.md

# --- 画面: ワイヤー索引の S_* のうち、page.tsx の画面IDコメントに現れるもの ---
# page.tsx 冒頭の `// S_XXX` が実装の唯一の目印 (CLAUDE.md のファイル規約)
designed_screens=$(grep -oE '^\| S_[A-Z_]+' "$INDEX" | sed 's/^| //' | sort -u)
# 1画面のページが複数IDを兼ねる場合があるため (例: `// S_HOME / S_MY_HOME`)、先頭行から全て拾う
implemented_screens=$(while IFS= read -r f; do
  head -n 1 "$f" | grep -oE 'S_[A-Z_]+'
done < <(find app -name 'page.tsx' 2>/dev/null) | sort -u)
screens_total=$(echo "$designed_screens" | grep -c .)
screens_done=$(comm -12 <(echo "$designed_screens") <(echo "$implemented_screens") | grep -c .)

# --- テーブル: マイグレーションの create table と tables.md の見出しを突き合わせる ---
designed_tables=$(grep -oE '^## [a-z_]+$' "$TABLES_DOC" | sed 's/^## //' | sort -u)
implemented_tables=$(grep -rhoiE 'create table (if not exists )?(public\.)?[a-z_]+' supabase/migrations 2>/dev/null \
  | awk '{print tolower($NF)}' | sed 's/^public\.//' | sort -u)
tables_total=$(echo "$designed_tables" | grep -c .)
tables_done=$(comm -12 <(echo "$designed_tables") <(echo "$implemented_tables") | grep -c .)

migrations=$(find supabase/migrations -name '*.sql' | wc -l | tr -d ' ')
tests=$(find app components lib tests -type f \( -name '*.test.*' -o -name '*.spec.*' \) 2>/dev/null | wc -l | tr -d ' ')
tests_rls=$(find tests/integration -name '*.test.ts' 2>/dev/null | wc -l | tr -d ' ')
tests_e2e=$(find tests/e2e -name '*.spec.ts' 2>/dev/null | wc -l | tr -d ' ')

printf 'SCREENS     %s / %s\n' "$screens_done" "$screens_total"
printf 'TABLES      %s / %s\n' "$tables_done" "$tables_total"
printf 'MIGRATIONS  %s\n' "$migrations"
printf 'TESTS       %s files (integration %s / e2e %s)\n' "$tests" "$tests_rls" "$tests_e2e"
echo
echo '--- 未実装の画面 (設計にあって page.tsx が無い) ---'
comm -23 <(echo "$designed_screens") <(echo "$implemented_screens") | paste -sd' ' -
echo
echo '--- 未作成のテーブル (tables.md にあってマイグレーションが無い) ---'
comm -23 <(echo "$designed_tables") <(echo "$implemented_tables") | paste -sd' ' -
