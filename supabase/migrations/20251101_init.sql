-- =========================================================
-- Built Media — Initial schema
-- =========================================================
-- Tables: profiles, clips, subscriptions, usage_events
-- All tables protected by RLS. Service role bypasses for backend.
-- =========================================================

-- -- PROFILES (extends auth.users) --
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  stripe_customer_id text unique,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- -- SUBSCRIPTIONS --
-- Tracks active Stripe subscription per user
create type public.plan_tier as enum ('free', 'starter', 'pro', 'studio');
create type public.sub_status as enum ('active', 'trialing', 'past_due', 'canceled', 'incomplete');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan public.plan_tier not null default 'free',
  status public.sub_status not null default 'active',
  monthly_clip_limit int not null default 3,  -- free tier: 3 trial clips
  current_period_start timestamptz default now(),
  current_period_end timestamptz default now() + interval '30 days',
  cancel_at_period_end boolean default false,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  unique(user_id)
);

alter table public.subscriptions enable row level security;

create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create index idx_subscriptions_user on public.subscriptions(user_id);

-- -- CLIPS (jobs) --
create type public.clip_status as enum ('queued', 'processing', 'ready', 'failed');

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  source_title text,
  source_duration_seconds int,
  engine text not null default 'mock',         -- 'opus' | 'mock' | future engines
  external_job_id text,                         -- ID from the upstream engine
  status public.clip_status not null default 'queued',
  error_message text,
  -- Output: array of clip objects [{ url, thumbnail, start, end, caption, score }]
  output jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.clips enable row level security;

create policy "Users read own clips"
  on public.clips for select
  using (auth.uid() = user_id);

create policy "Users insert own clips"
  on public.clips for insert
  with check (auth.uid() = user_id);

create policy "Users update own clips"
  on public.clips for update
  using (auth.uid() = user_id);

create policy "Users delete own clips"
  on public.clips for delete
  using (auth.uid() = user_id);

create index idx_clips_user_created on public.clips(user_id, created_at desc);
create index idx_clips_status on public.clips(status);
create index idx_clips_external_job on public.clips(external_job_id);

-- Realtime publication so frontend gets live status updates
alter publication supabase_realtime add table public.clips;

-- -- USAGE EVENTS --
-- Append-only log used to count clips per billing period.
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clip_id uuid references public.clips(id) on delete set null,
  event_type text not null default 'clip_created',
  created_at timestamptz default now() not null
);

alter table public.usage_events enable row level security;

create policy "Users read own usage"
  on public.usage_events for select
  using (auth.uid() = user_id);

create index idx_usage_user_created on public.usage_events(user_id, created_at desc);

-- -- HELPERS --

-- Auto-create profile + free subscription on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);

  insert into public.subscriptions (user_id, plan, status, monthly_clip_limit)
  values (new.id, 'free', 'active', 3);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.touch_updated_at();
create trigger clips_updated_at before update on public.clips
  for each row execute function public.touch_updated_at();

-- Usage helper: clips created in current billing period
create or replace function public.clips_used_this_period(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.usage_events ue
  join public.subscriptions s on s.user_id = ue.user_id
  where ue.user_id = p_user_id
    and ue.event_type = 'clip_created'
    and ue.created_at >= s.current_period_start;
$$;
