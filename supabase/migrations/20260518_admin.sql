-- =========================================================
-- Built Media — Admin support
-- =========================================================
-- Adds:
--   * profiles.is_admin flag (boolean, default false)
--   * is_admin(uid) SQL helper (security definer)
--   * admin_actions audit table (append-only)
-- =========================================================

-- -- ADMIN FLAG --
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create index if not exists idx_profiles_is_admin on public.profiles(is_admin) where is_admin = true;

-- -- ADMIN HELPER --
-- Returns true if the given user id has profiles.is_admin = true.
-- Used by RLS policies and by service-role backend code.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = uid),
    false
  );
$$;

-- -- ADMIN ACTIONS (audit log) --
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

alter table public.admin_actions enable row level security;

-- Only admins may read the audit log. Writes are performed by the
-- service-role client server-side (RLS is bypassed for service role).
drop policy if exists "Admins read audit log" on public.admin_actions;
create policy "Admins read audit log"
  on public.admin_actions for select
  using (public.is_admin(auth.uid()));

create index if not exists idx_admin_actions_created on public.admin_actions(created_at desc);
create index if not exists idx_admin_actions_actor on public.admin_actions(actor_user_id, created_at desc);
create index if not exists idx_admin_actions_target on public.admin_actions(target_type, target_id);
