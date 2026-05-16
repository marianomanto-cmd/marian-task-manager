-- Project board items: a flat list of pending work organised by project.
-- Owned by Mariano (admin) but readable by the whole agency so the team
-- can see what's on the client-facing board.

create table public.project_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project text not null,
  title text not null,
  category text not null default 'otros'
    check (category in ('mp', 'trafico', 'creativo', 'reporting', 'otros')),
  status text not null default 'pending'
    check (status in ('pending', 'ongoing', 'waiting', 'done')),
  due_date date,
  link text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index project_items_project_idx
  on public.project_items (user_id, project, position);

create index project_items_status_idx
  on public.project_items (user_id, status);

create or replace function public.set_project_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger project_items_updated_at
  before update on public.project_items
  for each row execute function public.set_project_items_updated_at();

alter table public.project_items enable row level security;

-- Read: anyone in the agency. The board is intentionally visible to the
-- whole team (the spec says "nada que esconder").
create policy "project items read"
  on public.project_items
  for select
  using (public.is_sangria_member());

-- Write: only the row owner. The admin tab is gated in the proxy, but RLS
-- enforces it server-side too.
create policy "project items insert"
  on public.project_items
  for insert
  with check (auth.uid() = user_id);

create policy "project items update"
  on public.project_items
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "project items delete"
  on public.project_items
  for delete
  using (auth.uid() = user_id);
