# supabase スキルの出所

| 項目 | 値 |
|---|---|
| 取得元 | https://github.com/supabase/agent-skills (`skills/supabase/`) |
| 導入日 | 2026-09-16 |
| SKILL.md の version | 0.1.2（同梱 CHANGELOG.md は 0.1.7 まで記載。上流の表記揺れ） |

**更新手順:** 上流の `CHANGELOG.md` を確認し、必要なら `skills/supabase/` 配下を手で差し替えて
差分をレビューした上でコミットする。外部由来のスキルは実質プロンプトなので、無レビューで取り込まない。

**役割分担:** Supabase 一般の知識はこのスキル、本プロジェクト固有の規約は [db-implement](../db-implement/SKILL.md)。
矛盾した場合は db-implement と docs/ を優先する。
