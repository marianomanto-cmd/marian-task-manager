-- MASTER now shows tasks as well as hitos, and can be filtered by group, so
-- its public link (`/m/<token>`, migration 0031) has to carry the same shape:
-- every item, plus the groups the filter offers.
--
-- This replaces `get_public_master_milestones`, which only ever returned
-- hitos. Same token check, same singleton, wider payload.

drop function if exists public.get_public_master_milestones(uuid);

create or replace function public.get_public_master_items(p_token uuid)
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
  where p_token is not null
    and exists (
      select 1 from public.timeline_master_share s
      where s.share_token = p_token
    )
  order by i.start_date asc, i."position" asc;
$$;

create or replace function public.get_public_master_groups(p_token uuid)
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
  where p_token is not null
    and exists (
      select 1 from public.timeline_master_share s
      where s.share_token = p_token
    )
  order by g."position" asc, g.created_at asc;
$$;

grant execute on function public.get_public_master_items(uuid) to anon, authenticated;
grant execute on function public.get_public_master_groups(uuid) to anon, authenticated;
