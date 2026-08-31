-- Timeliner dependencies + key items.
--
-- 1. `timeline_dependencies` links two items of the same timeline. The four
--    classic Gantt types are supported, expressed as the pair of endpoints the
--    link joins (predecessor endpoint → successor endpoint):
--      FS  finish → start  (the default: B starts after A ends)
--      SS  start  → start
--      FF  finish → finish
--      SF  start  → finish
--    `lag_days` shifts the constraint (negative = overlap / lead).
--
-- 2. `timeline_items.is_key` flags an item as important enough to surface in
--    the cross-timeline MASTER planning view. Milestones are always key, so
--    this only ever needs setting on tasks.

create table if not exists public.timeline_dependencies (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  from_item_id uuid not null references public.timeline_items(id) on delete cascade,
  to_item_id uuid not null references public.timeline_items(id) on delete cascade,
  dep_type text not null default 'FS' check (dep_type in ('FS', 'SS', 'FF', 'SF')),
  lag_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A link to itself is never a constraint, only a cycle.
  constraint timeline_dependencies_not_self check (from_item_id <> to_item_id)
);

-- One link per ordered pair: re-dragging the same pair edits it, never
-- stacks a second arrow on top of the first.
create unique index if not exists timeline_dependencies_pair_idx
  on public.timeline_dependencies (from_item_id, to_item_id);

create index if not exists timeline_dependencies_timeline_idx
  on public.timeline_dependencies (timeline_id);
create index if not exists timeline_dependencies_to_idx
  on public.timeline_dependencies (to_item_id);

create or replace function public.set_timeline_dependencies_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists timeline_dependencies_updated_at on public.timeline_dependencies;
create trigger timeline_dependencies_updated_at
  before update on public.timeline_dependencies
  for each row execute function public.set_timeline_dependencies_updated_at();

alter table public.timeline_dependencies enable row level security;

-- Team-shared, like the rest of Timeliner.
drop policy if exists "timeline_dependencies all" on public.timeline_dependencies;
create policy "timeline_dependencies all" on public.timeline_dependencies
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());

-- ---------------------------------------------------------------------------
-- Key items
-- ---------------------------------------------------------------------------

alter table public.timeline_items
  add column if not exists is_key boolean not null default false;

-- The MASTER view reads "key items from here forward" across every timeline.
create index if not exists timeline_items_key_idx
  on public.timeline_items (start_date)
  where is_key;

-- ---------------------------------------------------------------------------
-- Public share link: dependencies render on `/t/<token>` too, so the client
-- sees the same chain the team does. Token-scoped exactly like the rest.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_timeline_dependencies(p_token uuid)
returns table (
  id uuid,
  timeline_id uuid,
  from_item_id uuid,
  to_item_id uuid,
  dep_type text,
  lag_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.timeline_id, d.from_item_id, d.to_item_id, d.dep_type, d.lag_days
  from public.timeline_dependencies d
  join public.timelines t on t.id = d.timeline_id
  where p_token is not null and t.share_token = p_token;
$$;

grant execute on function public.get_public_timeline_dependencies(uuid) to anon, authenticated;

-- `is_key` joins the public item payload so both renderers read one shape.
-- Postgres needs the old function dropped before the return type can grow.
drop function if exists public.get_public_timeline_items(uuid);

create function public.get_public_timeline_items(p_token uuid)
returns table (
  id uuid,
  timeline_id uuid,
  group_id uuid,
  title text,
  owner_key text,
  start_date date,
  end_date date,
  kind text,
  "position" integer,
  is_key boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.timeline_id, i.group_id, i.title, i.owner_key,
    i.start_date, i.end_date, i.kind, i."position", i.is_key
  from public.timeline_items i
  join public.timelines t on t.id = i.timeline_id
  where p_token is not null and t.share_token = p_token
  order by i."position" asc, i.start_date asc, i.created_at asc;
$$;

grant execute on function public.get_public_timeline_items(uuid) to anon, authenticated;
