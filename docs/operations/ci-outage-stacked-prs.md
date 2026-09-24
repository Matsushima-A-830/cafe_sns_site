# CI予算切れ期間のスタックPR運用（〜2026-10-01）

**この文書は時限措置。** GitHub Actions の支払い/予算上限に達し、CI（`Lint / Typecheck / Test` /
`Migration Lint` / `Playwright` / `Supabase Integration`）が起動しなくなった状態への対応。
予算復活予定日は **2026-10-01**。復活を確認したら「解消後の手順」を実施し、この文書は
[git-workflow.md](./git-workflow.md) の通常運用に戻ったことを明記した上で読み手に注意喚起のみ残す。

## 背景

- PR #75（`fix/username-rls-guard`、D46対応）作成時点で CI が全ジョブ `not started` になっていることを確認。
  原因は `gh run view` のアノテーション「recent account payments have failed or your spending limit
  needs to be increased」— テスト失敗ではなくジョブが起動していない
- [git-workflow.md #ブランチ保護](./git-workflow.md#ブランチ保護main) の通り、GitHub Free では
  branch protection が使えず、CI green は lefthook（pre-push）と並ぶ二重チェックの片翼として運用している。
  その片翼が使えない期間なので、**代替の検証手段を明文化して守る**のがこの文書の目的
- 判断: PR #75 はマージを保留し、CI が実際に通るようになるまで main には入れない
  （[git-workflow.md #main への直接pushはしない、CIが赤いPRはマージしない](./git-workflow.md#保護が無効な間の運用ルール自己規律で担保)
  の精神を踏襲。「CI未実行」も「CIが赤い」と同様に扱う）

## 方針: mainを止めず、PRをスタックで積む

CI待ちで PR #75 をマージできない間も開発は止めない。**後続の変更は main からではなく、
直前の未マージPRのブランチから枝分かれさせて積み上げる**（スタックPR）。
CI が復活したら根本（PR #75）から順にマージし、GitHub が後続PRのbaseを自動追従させる。

```
main
 └─ fix/username-rls-guard (PR #75, D46)
     └─ feature/xxx-2 (PR #76, base: fix/username-rls-guard)
         └─ feature/xxx-3 (PR #77, base: feature/xxx-2)
             └─ ...
```

### なぜ main から個別に切らないのか

- main から都度切ると、PR #75 の変更（`guard_privileged_profile_columns` トリガー等）に依存する
  後続の変更が「PR #75 とのマージ前提の差分」を毎回抱えることになり、レビュー時に何がPR #75由来で
  何が新規かが区別できない
- スタックなら各PRの diff が「直前のPRからの純粋な増分」になり、CI復活後にそのまま個別レビュー・
  個別マージできる

## 手順

### 1. スタックの次のブランチを切る

**必ず直前の未マージブランチから分岐する。`main` からではない。**

```bash
# 例: PR #75 (fix/username-rls-guard) の上に積む場合
git checkout fix/username-rls-guard
git pull origin fix/username-rls-guard   # 他セッションが積んでいる可能性があるため
git checkout -b feature/xxx-2
```

### 2. 実装・ローカル検証（CIの代替）

CI が動かない間は、CIが本来担保していたチェックを**すべてローカルで手動実行**してから push する。
lefthook の pre-commit / pre-push は通常通り動くが、それだけでは `Migration Lint` /
`Supabase Integration` / `Playwright` 相当が抜ける。

| CIジョブ相当 | ローカル代替コマンド | 備考 |
|---|---|---|
| `Lint / Typecheck / Test` | `pnpm lint && pnpm typecheck && pnpm test:run` | pre-push でも実行されるが、push前に手元で先に確認する |
| `Migration Lint` | マイグレーション追加時は `pnpm db:reset` が素直に通ることを確認 | CIの `migration-check.yml` 相当。ローカルSupabase起動が前提 |
| `Supabase Integration` | `pnpm test:integration` | RLS統合テスト。DB変更が無いPRでも既存分がデグレしていないか確認 |
| `Playwright` | UI変更時のみ `pnpm test:e2e` | 変更が無ければスキップ可。UIを触ったPRは必ず実行 |

**このPR個別の判断も忘れずに:** `/self-review` → `/code-review` は通常通り実施する
（CI云々に関係なく品質ゲートとして必須）。

### 3. push してPRを作成する — baseを直前のブランチに指定する

```bash
git push -u origin feature/xxx-2

gh pr create \
  --base fix/username-rls-guard \
  --title "..." \
  --body "..."
```

**`--base` を省略すると自動的に `main` になり、PR #75 の差分ごと巻き込んだ巨大diffになる。**
必ず明示する。

PR本文には、通常のテンプレート（[git-workflow.md #PRタイトル本文](./git-workflow.md#pr-タイトル本文)）に加えて
以下を追記する:

```markdown
## スタックPR（CI予算切れ対応）
- Base: #75（このPRがマージされるまでマージ不可）
- ローカル検証: lint / typecheck / test:run / test:integration 実行済み（CI相当）
```

### 4. さらに積む場合は 1〜3 を繰り返す

次のブランチは `feature/xxx-2` から切る。スタックは深くなるほどコンフリクト解消が
面倒になるため、**目安として3〜4段まで**に留め、それ以上は一旦 CI 復活を待つことを検討する。

## マージ順序のルール

- **CI が実際に green になるまで、スタックのどのPRもマージしない**（PR #75 も含む）
- 予算復活後は **根本（PR #75）から順に**マージする。途中を飛ばさない
  - 途中のPRを先にマージすると base 関係が壊れ、後続PRのdiffが不正確になる
- 1件マージするたびに後続PRのCIが再トリガーされるのを待ってから次をマージする

## 解消後の手順（予算復活を確認したら）

1. `gh pr checks 75` 等で実際にジョブが起動し green になることを確認する
   （`not started` ではなく `pass`/`fail` が返る状態）
2. スタックの根本（PR #75）から順に、通常運用どおり CI green → マージ
3. GitHub は「マージされたPRをbaseにしていた後続PR」の base を自動的に `main` へ更新する
   （retarget）。後続PRを開いて base が意図通り更新されたか目視確認する
4. 後続PRも CI が再実行されるので green を確認して順にマージ
5. 全PRマージ後、この文書の冒頭に「解消済み（2026-XX-XX）」を追記し、
   [git-workflow.md](./git-workflow.md) の通常運用（CI必須・main直接pushしない）に完全復帰したことを明記する
6. [docs/README.md](../README.md) の横断参照からこの文書へのリンクを外す
   （運用ドキュメントとしての役目を終えたため。削除はせずアーカイブとして残す）

## 落とし穴

- **スタックの途中でコンフリクトが起きたら、根本側から順にrebaseし直す。** 末端から直すと
  何度もやり直しになる
- **force-push は自分が切ったスタックブランチのみ**。`main` への force-push は
  [git-workflow.md](./git-workflow.md) の通り常に禁止
- **`pnpm test:integration` を軽視しない。** CIの `Supabase Integration` はローカルDBと
  スキーマが違う可能性を検知する役目もある。`pnpm db:reset` を必ず経由してから統合テストを走らせる
- **緊急でどうしても1件だけ先にmainへ入れたい場合**（今回のPR #75のように）は、
  ローカル検証結果を明記した上で例外的にマージする判断もありうるが、その場合は
  スタックの土台が変わるため後続PRは base を `main` に付け替える必要がある。
  安易に多用しない — CI飛ばしでのマージは1PRあたり1回のユーザー判断を要する
  （[CLAUDE.md #Claude Code と作業する際のGit運用](../../CLAUDE.md)）
