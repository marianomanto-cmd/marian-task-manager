-- Public read-only link for MASTER: the hitos of every timeline on one page
-- (`/m/<token>`), the Timeliner counterpart of the projects board's `/todos`.
--
-- Unlike a per-timeline link, this one spans everything, so it is a TEAM link:
-- whoever opens it sees every project's name and dates. The UI says so where
-- the link is generated.
--
-- There is exactly one MASTER link for the whole workspace, so the token lives
-- in a singleton row rather than on any timeline.

create table if not exists public.timeline_master_share (
  -- `primary key` + `check (id)` pins the table to a single row (id = true).
  id boolean primary key default true check (id),
  share_token uuid,
  updated_at timestamptz not null default now()
);

insert into public.timeline_master_share (id, share_token)
  values (true, null)
  on conflict (id) do nothing;

create unique index if not exists timeline_master_share_token_idx
  on public.timeline_master_share (share_token)
  where share_token is not null;

create or replace function public.set_timeline_master_share_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists timeline_master_share_updated_at on public.timeline_master_share;
create trigger timeline_master_share_updated_at
  before update on public.timeline_master_share
  for each row execute function public.set_timeline_master_share_updated_at();

alter table public.timeline_master_share enable row level security;

-- Team-shared, like the rest of Timeliner. The row is created above, so
-- members only ever update it.
drop policy if exists "timeline_master_share all" on public.timeline_master_share;
create policy "timeline_master_share all" on public.timeline_master_share
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());

-- ---------------------------------------------------------------------------
-- Public read API. Both functions resolve the token against the singleton and
-- return nothing when it doesn't match — the same shape as the per-timeline
-- link's functions in 0029.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_master_timelines(p_token uuid)
returns table (
  id uuid,
  name text,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t."position"
  from public.timelines t
  where p_token is not null
    and exists (
      select 1 from public.timeline_master_share s
      where s.share_token = p_token
    )
  order by t."position" asc, t.created_at asc;
$$;

-- Hitos only: MASTER never shows tasks, so the public payload doesn't carry
-- them either. Nothing leaks that the page wouldn't draw.
create or replace function public.get_public_master_milestones(p_token uuid)
returns table (
  id uuid,
  timeline_id uuid,
  group_id uuid,
  title text,
  owner_key text,
  start_date date,
  end_date date,
  kind text,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id, i.timeline_id, i.group_id, i.title, i.owner_key,
    i.start_date, i.end_date, i.kind, i."position"
  from public.timeline_items i
  where i.kind = 'milestone'
    and p_token is not null
    and exists (
      select 1 from public.timeline_master_share s
      where s.share_token = p_token
    )
  order by i.start_date asc, i."position" asc;
$$;

grant execute on function public.get_public_master_timelines(uuid) to anon, authenticated;
grant execute on function public.get_public_master_milestones(uuid) to anon, authenticated;
