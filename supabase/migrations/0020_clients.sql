-- Clients: a managed list (add/remove) owned by the admin. Each project
-- (a projects_meta row) can belong to one client, so the board can be
-- grouped by client as an alternative to grouping by project.

create table if not exists public.clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);

create index if not exists clients_user_position_idx
  on public.clients (user_id, position);

alter table public.clients enable row level security;

-- Read: whole agency (the board is team-visible). Write: row owner only.
create policy "clients read"
  on public.clients
  for select
  using (public.is_sangria_member());

create policy "clients insert"
  on public.clients
  for insert
  with check (auth.uid() = user_id);

create policy "clients update"
  on public.clients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "clients delete"
  on public.clients
  for delete
  using (auth.uid() = user_id);

-- Each project optionally belongs to one client, referenced by name to stay
-- consistent with the existing denormalised projects_meta keying.
alter table public.projects_meta
  add column if not exists client text;

create index if not exists projects_meta_client_idx
  on public.projects_meta (user_id, client);

-- Seed "Copa Airlines" as the first client for every existing board owner.
insert into public.clients (user_id, name, position)
select user_id, 'Copa Airlines', 0
from public.project_items
group by user_id
on conflict (user_id, name) do nothing;
