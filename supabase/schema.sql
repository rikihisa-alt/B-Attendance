-- ============================================================================
-- B-Attendance / 勤怠管理システム  Supabase スキーマ (v2)
-- ============================================================================
-- 対象: 株式会社Backlly 自社運用 / 30名規模
-- DB: PostgreSQL 15+ (Supabase)
-- リージョン: ap-northeast-1 (Tokyo) 必須
-- 認証: Supabase Auth (一般ユーザー) + bcrypt (管理者パスワード)
-- 設計方針:
--   - 単一テナント
--   - 全テーブルRLS有効化、JWT claimでrole判定
--   - 既存b-attendance.html(v7+) の DB 構造を 1:1 で移植
-- ============================================================================

-- 拡張機能
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. settings (システム設定 / 単一行)
-- ============================================================================
create table public.settings (
  id              integer primary key default 1 check (id = 1),
  company_name    text not null default '株式会社Backlly',

  -- 所定労働
  standard_work_hours      numeric(4,2) not null default 8.0,
  standard_work_days       integer      not null default 20,
  work_start_time          time         not null default '09:00',
  work_end_time            time         not null default '18:00',

  -- 36協定
  monthly_overtime_limit   integer not null default 45,
  yearly_overtime_limit    integer not null default 360,
  monthly_overtime_warning integer not null default 36,

  -- 管理者パスワード (bcrypt hash)
  admin_password_hash       text not null,
  admin_password_changed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. employees (従業員)
-- ============================================================================
create table public.employees (
  id                text primary key,
  auth_user_id      uuid unique,
  name              text not null,
  kana              text,
  birthday          date,
  dept              text,
  position          text,
  status            text not null default 'active' check (status in ('active','inactive')),
  paid_leave_total  numeric(4,1) not null default 10.0,
  paid_leave_used   numeric(4,1) not null default 0.0,
  first_login       boolean not null default true,
  pw_changed_at     timestamptz,
  pw_reset_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_employees_status on public.employees(status);
create index idx_employees_auth_user_id on public.employees(auth_user_id);

-- ============================================================================
-- 3. attendance (勤怠記録)
-- ============================================================================
-- 1人1日 = 1レコード。打刻はeventsカラム(jsonb)に時系列で蓄積。
-- events スキーマ:
--   [
--     { "type": "in" | "out" | "break_start" | "break_end",
--       "time": "2026-04-28T09:00:00.000Z",
--       "source": "clock" | "manual" | "request",
--       "cancelled": false,
--       "cancelledAt": "..."
--     }
--   ]
create table public.attendance (
  id                    uuid primary key default uuid_generate_v4(),
  emp_id                text not null references public.employees(id) on delete cascade,
  date                  date not null,
  events                jsonb not null default '[]'::jsonb,
  note                  text default '',
  admin_note            text,
  admin_note_updated_at timestamptz,
  admin_note_by         text,
  modified_by           text,
  modified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(emp_id, date)
);

create index idx_attendance_emp_date on public.attendance(emp_id, date desc);
create index idx_attendance_date on public.attendance(date desc);

-- ============================================================================
-- 4. correction_requests (打刻修正申請)
-- ============================================================================
create table public.correction_requests (
  id                uuid primary key default uuid_generate_v4(),
  emp_id            text not null references public.employees(id) on delete cascade,
  emp_name          text not null,
  date              date not null,
  requested_events  jsonb not null,
  reason            text not null,
  status            text not null default 'pending'
                         check (status in ('pending','approved','rejected','withdrawn')),
  submitted_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       text,
  withdrawn_at      timestamptz,
  reject_reason     text,
  created_at        timestamptz not null default now()
);

create index idx_correction_emp on public.correction_requests(emp_id, submitted_at desc);
create index idx_correction_status on public.correction_requests(status, submitted_at desc);

-- ============================================================================
-- 5. leave_requests (休暇申請)
-- ============================================================================
-- type: 'paid','paid_am','paid_pm','sick','special','absence'
create table public.leave_requests (
  id            uuid primary key default uuid_generate_v4(),
  emp_id        text not null references public.employees(id) on delete cascade,
  emp_name      text not null,
  type          text not null
                  check (type in ('paid','paid_am','paid_pm','sick','special','absence')),
  from_date     date not null,
  to_date       date not null,
  reason        text,
  status        text not null default 'pending'
                     check (status in ('pending','approved','rejected','withdrawn')),
  submitted_at  timestamptz not null default now(),
  reviewed_at   timestamptz,
  reviewed_by   text,
  withdrawn_at  timestamptz,
  reject_reason text,
  created_at    timestamptz not null default now()
);

create index idx_leave_emp on public.leave_requests(emp_id, submitted_at desc);
create index idx_leave_status on public.leave_requests(status, submitted_at desc);
create index idx_leave_dates on public.leave_requests(from_date, to_date);

-- ============================================================================
-- 6. audit_log (監査ログ / 5年保存対応)
-- ============================================================================
create table public.audit_log (
  id          bigserial primary key,
  actor_type  text not null check (actor_type in ('admin','user','system')),
  actor_id    text,
  action      text not null,
  target_type text,
  target_id   text,
  before_data jsonb,
  after_data  jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index idx_audit_created on public.audit_log(created_at desc);
create index idx_audit_actor on public.audit_log(actor_id, created_at desc);
create index idx_audit_target on public.audit_log(target_type, target_id);

-- ============================================================================
-- updated_at 自動更新トリガー
-- ============================================================================
create or replace function trg_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger settings_updated_at   before update on public.settings   for each row execute function trg_set_updated_at();
create trigger employees_updated_at  before update on public.employees  for each row execute function trg_set_updated_at();
create trigger attendance_updated_at before update on public.attendance for each row execute function trg_set_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================
-- 一般ユーザー: Supabase Auth + JWT app_metadata.emp_id で自分のデータ判定
-- 管理者操作: サーバー側で service_role キー使用（RLS をバイパス）

create or replace function auth_emp_id()
returns text as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json->'app_metadata'->>'emp_id', ''),
    null
  );
$$ language sql stable;

create or replace function auth_is_admin()
returns boolean as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::json->'app_metadata'->>'role' = 'admin',
    false
  );
$$ language sql stable;

-- settings
alter table public.settings enable row level security;
create policy settings_select on public.settings for select using (true);
create policy settings_modify on public.settings for all using (auth_is_admin()) with check (auth_is_admin());

-- employees
alter table public.employees enable row level security;
create policy employees_select_self on public.employees
  for select using (id = auth_emp_id() or auth_is_admin());
create policy employees_update_self on public.employees
  for update using (id = auth_emp_id() or auth_is_admin())
  with check (id = auth_emp_id() or auth_is_admin());
create policy employees_admin_all on public.employees
  for all using (auth_is_admin()) with check (auth_is_admin());

-- attendance
alter table public.attendance enable row level security;
create policy attendance_select on public.attendance
  for select using (emp_id = auth_emp_id() or auth_is_admin());
create policy attendance_insert on public.attendance
  for insert with check (emp_id = auth_emp_id() or auth_is_admin());
create policy attendance_update on public.attendance
  for update using (emp_id = auth_emp_id() or auth_is_admin())
  with check (emp_id = auth_emp_id() or auth_is_admin());
create policy attendance_admin_delete on public.attendance
  for delete using (auth_is_admin());

-- correction_requests
alter table public.correction_requests enable row level security;
create policy correction_select on public.correction_requests
  for select using (emp_id = auth_emp_id() or auth_is_admin());
create policy correction_insert on public.correction_requests
  for insert with check (emp_id = auth_emp_id() or auth_is_admin());
create policy correction_update on public.correction_requests
  for update using (emp_id = auth_emp_id() or auth_is_admin())
  with check (emp_id = auth_emp_id() or auth_is_admin());

-- leave_requests
alter table public.leave_requests enable row level security;
create policy leave_select on public.leave_requests
  for select using (emp_id = auth_emp_id() or auth_is_admin());
create policy leave_insert on public.leave_requests
  for insert with check (emp_id = auth_emp_id() or auth_is_admin());
create policy leave_update on public.leave_requests
  for update using (emp_id = auth_emp_id() or auth_is_admin())
  with check (emp_id = auth_emp_id() or auth_is_admin());

-- audit_log
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select using (auth_is_admin());
-- insert は service_role のみ（RLSバイパス）

-- ============================================================================
-- 初期データ
-- ============================================================================
insert into public.settings (id, admin_password_hash)
values (1, crypt('admin', gen_salt('bf')))
on conflict (id) do nothing;

-- ============================================================================
-- メンテナンス用ビュー
-- ============================================================================
create or replace view public.v_paid_leave_summary as
select
  e.id as emp_id,
  e.name,
  e.paid_leave_total,
  e.paid_leave_used,
  coalesce(sum(
    case when l.status = 'approved' and l.type like 'paid%'
      then (l.to_date - l.from_date + 1)::numeric
         * case when l.type in ('paid_am','paid_pm') then 0.5 else 1.0 end
      else 0 end
  ), 0) as approved_paid_days,
  e.paid_leave_total - e.paid_leave_used - coalesce(sum(
    case when l.status = 'approved' and l.type like 'paid%'
      then (l.to_date - l.from_date + 1)::numeric
         * case when l.type in ('paid_am','paid_pm') then 0.5 else 1.0 end
      else 0 end
  ), 0) as remaining_days
from public.employees e
left join public.leave_requests l on l.emp_id = e.id
where e.status = 'active'
group by e.id, e.name, e.paid_leave_total, e.paid_leave_used;
