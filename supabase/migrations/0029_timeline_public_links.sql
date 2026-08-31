-- Public read-only links for Timeliner: every timeline can hand out its own
-- URL (`/t/<token>`) that a client opens without logging in and that shows
-- that timeline — and only that timeline — as it stands right now.
--
-- The timeliner tables stay locked down by RLS (agency members only). Public
-- access goes exclusively through the SECURITY DEFINER functions below, which
-- resolve the token server-side and filter by the timeline it belongs to, so a
-- link can never return another timeline's rows, whatever the caller does.

-- ---------------------------------------------------------------------------
-- 1. timelines.share_token — null means "not shared". Rotating writes a new
--    uuid (the old link dies); revoking sets it back to null.
-- ---------------------------------------------------------------------------

alter table public.timelines
  add column if not exists share_token uuid;

create unique index if not exists timelines_share_token_idx
  on public.timelines (share_token)
  where share_token is not null;

-- ---------------------------------------------------------------------------
-- 2. Public read API. Each function takes the token and returns nothing at all
--    when it doesn't match a timeline. `stable` because they only read, and
--    `set search_path = public` so the body can't be redirected by a caller's
--    search_path. No internal columns are exposed: no created_by, no token.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_timeline(p_token uuid)
returns table (
  id uuid,
  name text,
  weekends_enabled boolean,
  holiday_countries text[],
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.weekends_enabled, t.holiday_countries, t.updated_at
  from public.timelines t
  where p_token is not null and t.share_token = p_token
  limit 1;
$$;

create or replace function public.get_public_timeline_groups(p_token uuid)
returns table (
  id uuid,
  timeline_id uuid,
  name text,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.timeline_id, g.name, g."position"
  from public.timeline_groups g
  join public.timelines t on t.id = g.timeline_id
  where p_token is not null and t.share_token = p_token
  order by g."position" asc, g.created_at asc;
$$;

create or replace function public.get_public_timeline_items(p_token uuid)
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
  join public.timelines t on t.id = i.timeline_id
  where p_token is not null and t.share_token = p_token
  order by i."position" asc, i.start_date asc, i.created_at asc;
$$;

-- Only the holidays of the countries this timeline highlights: the public view
-- has no toggles, so anything else would be dead weight.
create or replace function public.get_public_timeline_holidays(p_token uuid)
returns table (
  country text,
  date date,
  name text
)
language sql
stable
security definer
set search_path = public
as $$
  select h.country, h.date, h.name
  from public.holidays h
  where exists (
    select 1
    from public.timelines t
    where p_token is not null
      and t.share_token = p_token
      and h.country = any (t.holiday_countries)
  )
  order by h.date asc;
$$;

-- Let unauthenticated visitors call them — that is the whole point of the
-- share link. The functions themselves are the security boundary.
grant execute on function public.get_public_timeline(uuid) to anon, authenticated;
grant execute on function public.get_public_timeline_groups(uuid) to anon, authenticated;
grant execute on function public.get_public_timeline_items(uuid) to anon, authenticated;
grant execute on function public.get_public_timeline_holidays(uuid) to anon, authenticated;
