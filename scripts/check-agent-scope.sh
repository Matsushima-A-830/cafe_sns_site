#!/usr/bin/env bash
# エージェントが無人マージしてよい変更かを判定する。
# 無人マージの唯一の安全弁なので、ここを緩める前に docs/operations/agent-pipeline.md を読むこと。
#
# 使い方:
#   git diff --cached --name-only | bash scripts/check-agent-scope.sh --stdin
#       ↑ CI (agent-implement.yml) が使う形。空白入りパスとリネームで壊れない
#   bash scripts/check-agent-scope.sh --base origin/main   # base との差分を見る
#   bash scripts/check-agent-scope.sh --files a.ts b.md    # ファイルを直接渡す
#
# 終了コード: 0 = 現在のステージで無人マージ可 / 1 = 不可（人がマージする）
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# 無人マージを許す範囲。widen するときはここだけを上げる。
# 1 = docs のみ / 2 = + テスト / 3 = + アプリケーションコード
STAGE="${AGENT_AUTOMERGE_STAGE:-1}"

# ステージに関係なく常に禁止。エージェントが「自分を止める仕組み」と
# 「戻せない変更」に触れた PR は、内容が正しくても人がマージする
FORBIDDEN=(
  '.github/'             # ワークフロー・必須チェックの定義そのもの
  'lefthook.yml'         # ローカルの止める仕組み
  'scripts/check-'       # 検査スクリプト（このファイル自身を含む）
  'commitlint.config.'   # コミット規約
  'supabase/migrations/' # forward-only。適用後は戻せない
  'supabase/config.toml'
  'package.json'         # 新しい依存の追加は事前提案が必要 (CLAUDE.md)
  'pnpm-lock.yaml'
  'CLAUDE.md'            # エージェント自身の行動規範
  '.env'
)

files=()
case "${1:-}" in
  --base)
    base="${2:?--base にはリファレンスが必要}"
    mapfile -t files < <(git diff --name-only "$base"...HEAD)
    ;;
  --files)
    shift
    files=("$@")
    ;;
  # 空白を含むパスやリネームで壊れないよう、呼び出し側は原則こちらを使う
  --stdin)
    mapfile -t files
    ;;
  *)
    echo "usage: $0 --base <ref> | --files <path>... | --stdin" >&2
    exit 2
    ;;
esac

if [ ${#files[@]} -eq 0 ]; then
  echo "変更ファイルが 0 件。無人マージの対象にしない" >&2
  exit 1
fi

# 判定結果を GitHub Actions のステップ出力にも流す
emit() {
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1=$2" >> "$GITHUB_OUTPUT"
  return 0
}

deny() {
  echo "NG: $1"
  emit allowed false
  emit reason "$1"
  exit 1
}

for f in "${files[@]}"; do
  for pattern in "${FORBIDDEN[@]}"; do
    case "$f" in
      "$pattern"*) deny "$f は常時禁止パス ($pattern) に含まれる" ;;
    esac
  done
done

# ステージごとの許可パターン。case のグロブなので ** は使えない
allowed_by_stage() {
  local f="$1"
  case "$f" in
    docs/*) return 0 ;;
  esac
  if [ "$STAGE" -ge 2 ]; then
    case "$f" in
      tests/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx) return 0 ;;
    esac
  fi
  if [ "$STAGE" -ge 3 ]; then
    case "$f" in
      app/*|components/*|lib/*|types/*) return 0 ;;
    esac
  fi
  return 1
}

for f in "${files[@]}"; do
  allowed_by_stage "$f" || deny "$f はステージ $STAGE の許可範囲外"
done

echo "OK: ${#files[@]} 件すべてステージ $STAGE の範囲内"
printf '  %s\n' "${files[@]}"
emit allowed true
emit stage "$STAGE"
