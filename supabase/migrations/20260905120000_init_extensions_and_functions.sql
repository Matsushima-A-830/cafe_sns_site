-- ============================================
-- 初期セットアップ: 拡張と全テーブル共通の関数
--
-- 有効化するのは pgcrypto / citext / postgis / pg_trgm の4つのみ。
-- pgroonga は不採用（全文検索は simple tsvector + pg_trgm の2本立て）、
-- pg_cron も Supabase Pro 以上なので使わない。
--   docs/product/pending-items.md D1
--   docs/architecture/data-model/tables.md #全文検索の方式
-- ============================================

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ============================================
-- 共通トリガー関数
-- ============================================

-- updated_at を持つテーブルは例外なくこのトリガーを張る
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'updated_at を now() で更新する BEFORE UPDATE トリガー関数';

-- ============================================
-- 共通ユーティリティ関数
-- ============================================

-- Tiptap JSON から平文を抽出する。type == "text" のリーフを文書順に連結する。
-- posts.body_text / body_search の生成列から呼ぶため IMMUTABLE 必須。
--   docs/architecture/data-model/tables.md #全文検索の方式
--
-- jsonpath は lax ではなく strict を使う。lax は配列を自動展開するので
-- `$.**` が同じリーフを配列経由と直接参照の2回拾い、本文が重複する。
create or replace function public.tiptap_to_plaintext(doc jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select string_agg(leaf->>'text', ' ')
  from jsonb_path_query(doc, 'strict $.** ? (@.type == "text")') as leaf
$$;

comment on function public.tiptap_to_plaintext(jsonb) is
  'Tiptap JSON のテキストリーフを空白区切りで連結する（全文検索・抜粋用）';
