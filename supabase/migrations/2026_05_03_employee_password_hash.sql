-- ============================================================================
-- Migration: 従業員パスワードを employees.password_hash で自社管理に切替
-- 2026-05-03
-- ============================================================================
-- 背景:
--   Supabase Auth の Email プロバイダ設定の影響で signInWithPassword が
--   "Email logins are disabled" を返し、管理者がパスワードを更新しても
--   従業員がログインできない状態だった。管理者と同じく bcrypt + JWT cookie で
--   従業員ログインを完結させるため、employees に password_hash を追加する。
--
-- 適用後の運用:
--   - 既存従業員は password_hash が NULL のためログイン不可
--   - 管理者画面でパスワードリセットを実行すると bcrypt ハッシュが書き込まれる
--   - 一度リセットされた従業員はそのパスワードでログインできるようになる
-- ============================================================================

alter table public.employees
  add column if not exists password_hash text;

comment on column public.employees.password_hash is
  '従業員ログイン用 bcrypt ハッシュ。admin の create / reset / 本人の change で更新される。';
