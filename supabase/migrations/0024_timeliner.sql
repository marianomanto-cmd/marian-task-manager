-- Timeliner: team-shared project timelines (Gantt). Any signed-in agency
-- member can read and edit. Holidays come from the existing public.holidays
-- table; weekends/holiday overlays are a per-timeline view setting.

create table if not exists public.timelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  weekends_enabled boolean not null default true,
  -- Subset of holiday country codes ('AR','PA','US','ES') to highlight.
  holiday_countries text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timeline_items (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  title text not null,
  owner_key text,
  start_date date not null,
  end_date date not null,
  kind text not null default 'task' check (kind in ('task', 'milestone')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timeline_items_timeline_idx
  on public.timeline_items (timeline_id, position);
create index if not exists timeline_items_dates_idx
  on public.timeline_items (timeline_id, start_date);

create or replace function public.set_timelines_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists timelines_updated_at on public.timelines;
create trigger timelines_updated_at
  before update on public.timelines
  for each row execute function public.set_timelines_updated_at();

create or replace function public.set_timeline_items_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists timeline_items_updated_at on public.timeline_items;
create trigger timeline_items_updated_at
  before update on public.timeline_items
  for each row execute function public.set_timeline_items_updated_at();

alter table public.timelines enable row level security;
alter table public.timeline_items enable row level security;

-- Team-shared: any agency member can read and write.
drop policy if exists "timelines all" on public.timelines;
create policy "timelines all" on public.timelines
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());

drop policy if exists "timeline_items all" on public.timeline_items;
create policy "timeline_items all" on public.timeline_items
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());
