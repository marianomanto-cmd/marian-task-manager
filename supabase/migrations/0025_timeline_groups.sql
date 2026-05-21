-- Timeliner groups: optional sections to organize a timeline's items.
-- Items reference a group (nullable = ungrouped). Team-shared like the rest
-- of Timeliner.

create table if not exists public.timeline_groups (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.timelines(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timeline_groups_timeline_idx
  on public.timeline_groups (timeline_id, position);

alter table public.timeline_items
  add column if not exists group_id uuid
    references public.timeline_groups(id) on delete set null;

create index if not exists timeline_items_group_idx
  on public.timeline_items (group_id);

create or replace function public.set_timeline_groups_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists timeline_groups_updated_at on public.timeline_groups;
create trigger timeline_groups_updated_at
  before update on public.timeline_groups
  for each row execute function public.set_timeline_groups_updated_at();

alter table public.timeline_groups enable row level security;

drop policy if exists "timeline_groups all" on public.timeline_groups;
create policy "timeline_groups all" on public.timeline_groups
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());
