-- Projects board v2: per-project metadata (color/emoji/order), per-item
-- description + archive timestamp, and a per-admin public share token so
-- clients can view the board read-only without an account.

-- 1. Per-item: description (markdown-ish notes) + archive timestamp.
alter table public.project_items
  add column if not exists description text,
  add column if not exists archived_at timestamptz;

create index if not exists project_items_archived_idx
  on public.project_items (user_id, archived_at);

-- 2. Per-project metadata. Project name is the key (denormalised) so we
-- don't need a separate projects table.
create table if not exists public.projects_meta (
  user_id uuid not null references auth.users(id) on delete cascade,
  project text not null,
  color text not null default 'slate'
    check (color in (
      'slate','sky','emerald','amber','rose','violet','fuchsia',
      'teal','indigo','orange'
    )),
  emoji text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, project)
);

create or replace function public.set_projects_meta_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_meta_updated_at on public.projects_meta;
create trigger projects_meta_updated_at
  before update on public.projects_meta
  for each row execute function public.set_projects_meta_updated_at();

alter table public.projects_meta enable row level security;

create policy "projects meta read"
  on public.projects_meta
  for select
  using (public.is_sangria_member());

create policy "projects meta insert"
  on public.projects_meta
  for insert
  with check (auth.uid() = user_id);

create policy "projects meta update"
  on public.projects_meta
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "projects meta delete"
  on public.projects_meta
  for delete
  using (auth.uid() = user_id);

-- 3. Share token on user_settings (one per admin). user_settings already
-- exists from earlier migrations; just add the column.
alter table public.user_settings
  add column if not exists projects_share_token uuid;

create unique index if not exists user_settings_share_token_idx
  on public.user_settings (projects_share_token)
  where projects_share_token is not null;

-- 4. Public read RPC. SECURITY DEFINER so it bypasses RLS for the rows
-- that match a valid token. Returns active items only (no archived) and
-- without internal columns. `position` is a reserved word in PG so it has
-- to be quoted both in the RETURNS TABLE column list and when selecting
-- it from the source table.
create or replace function public.get_shared_projects(token uuid)
returns table (
  id uuid,
  project text,
  title text,
  description text,
  category text,
  status text,
  due_date date,
  link text,
  "position" integer
)
language sql
security definer
set search_path = public
as $$
  with owner as (
    select user_id
    from public.user_settings
    where projects_share_token = token
    limit 1
  )
  select
    pi.id, pi.project, pi.title, pi.description, pi.category, pi.status,
    pi.due_date, pi.link, pi."position"
  from public.project_items pi
  join owner o on o.user_id = pi.user_id
  where pi.archived_at is null
  order by pi.project asc, pi."position" asc, pi.created_at asc;
$$;

create or replace function public.get_shared_projects_meta(token uuid)
returns table (
  project text,
  color text,
  emoji text,
  "position" integer
)
language sql
security definer
set search_path = public
as $$
  with owner as (
    select user_id
    from public.user_settings
    where projects_share_token = token
    limit 1
  )
  select pm.project, pm.color, pm.emoji, pm."position"
  from public.projects_meta pm
  join owner o on o.user_id = pm.user_id
  order by pm."position" asc, pm.project asc;
$$;

-- Allow anon (unauthenticated) clients to call the RPCs. Without this
-- grant the public share URL would still hit RLS via the function call.
grant execute on function public.get_shared_projects(uuid) to anon;
grant execute on function public.get_shared_projects_meta(uuid) to anon;
