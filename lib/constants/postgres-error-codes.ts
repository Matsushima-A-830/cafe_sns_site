/**
 * PostgreSQL の SQLSTATE コード。Server Actions からの制約違反判定で共通利用する
 * （CLAUDE.md 開発哲学「enumやマジック文字列は集約」）
 */
export const POSTGRES_UNIQUE_VIOLATION = '23505'
export const POSTGRES_FOREIGN_KEY_VIOLATION = '23503'
// RLS の WITH CHECK / USING に弾かれた場合（例: is_active_user() が偽）に返る
export const POSTGRES_INSUFFICIENT_PRIVILEGE = '42501'
