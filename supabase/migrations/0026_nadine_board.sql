-- Board - Nadine: a standalone, public (no-auth) copy of the Projects board
-- for an external client. Mirrors project_items / projects_meta / clients but
-- without a user_id (single shared board) and with "groups" instead of
-- "clients". Access is intentionally public: the board lives at the public
-- /boardnadine URL and anyone with the link can read and write it, so RLS is
-- permissive and the anon role is granted full CRUD. It is fully isolated
-- from the agency's own tables.

-- 1. Items (tasks).
create table if not exists public.nadine_project_items (
  id uuid primary key default gen_random_uuid(),
  project text not null,
  title text not null,
  description text,
  category text not null default 'otros'
    check (category in ('mp', 'trafico', 'creativo', 'reporting', 'otros')),
  status text not null default 'pending'
    check (status in ('pending', 'ongoing', 'waiting', 'done')),
  due_date date,
  link text,
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nadine_project_items_project_idx
  on public.nadine_project_items (project, position);
create index if not exists nadine_project_items_archived_idx
  on public.nadine_project_items (archived_at);

-- 2. Per-project metadata. Project name is the key. `grp` is the group the
-- project belongs to ("group" is a reserved word, so the column is `grp`).
create table if not exists public.nadine_projects_meta (
  project text primary key,
  color text not null default 'slate'
    check (color in (
      'slate','sky','emerald','amber','rose','violet','fuchsia',
      'teal','indigo','orange'
    )),
  emoji text,
  grp text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nadine_projects_meta_grp_idx
  on public.nadine_projects_meta (grp);

-- 3. Groups: a managed list (the "clients" analogue for Nadine's board).
create table if not exists public.nadine_groups (
  name text primary key,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists nadine_groups_position_idx
  on public.nadine_groups (position);

-- updated_at triggers (reuse standalone trigger functions).
create or replace function public.set_nadine_project_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nadine_project_items_updated_at on public.nadine_project_items;
create trigger nadine_project_items_updated_at
  before update on public.nadine_project_items
  for each row execute function public.set_nadine_project_items_updated_at();

create or replace function public.set_nadine_projects_meta_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nadine_projects_meta_updated_at on public.nadine_projects_meta;
create trigger nadine_projects_meta_updated_at
  before update on public.nadine_projects_meta
  for each row execute function public.set_nadine_projects_meta_updated_at();

-- RLS: enabled, but fully permissive. The board is public by design.
alter table public.nadine_project_items enable row level security;
alter table public.nadine_projects_meta enable row level security;
alter table public.nadine_groups enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'nadine_project_items', 'nadine_projects_meta', 'nadine_groups'
  ]
  loop
    execute format('drop policy if exists "%s public read" on public.%I;', t, t);
    execute format('drop policy if exists "%s public insert" on public.%I;', t, t);
    execute format('drop policy if exists "%s public update" on public.%I;', t, t);
    execute format('drop policy if exists "%s public delete" on public.%I;', t, t);

    execute format(
      'create policy "%s public read" on public.%I for select using (true);',
      t, t);
    execute format(
      'create policy "%s public insert" on public.%I for insert with check (true);',
      t, t);
    execute format(
      'create policy "%s public update" on public.%I for update using (true) with check (true);',
      t, t);
    execute format(
      'create policy "%s public delete" on public.%I for delete using (true);',
      t, t);
  end loop;
end
$$;

-- Grant CRUD to the anon + authenticated roles so the public (no-login)
-- board can be edited through the anon key.
grant select, insert, update, delete on public.nadine_project_items to anon, authenticated;
grant select, insert, update, delete on public.nadine_projects_meta to anon, authenticated;
grant select, insert, update, delete on public.nadine_groups to anon, authenticated;
