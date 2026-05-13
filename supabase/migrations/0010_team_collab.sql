-- Multi-tenant collab: relax RLS on shared resources (tasks, OOO) to any
-- @sangria.agency email; add task_assignees (key-based, no FK to auth.users
-- because we want to assign people who haven't logged in yet), task_comments,
-- and task_activity for the global feed.
--
-- Per-user tables (emails, sync_log, user_settings, email_ai) keep their
-- auth.uid() = user_id policies — each user only ever sees their own Gmail.

-- ─── Domain helper ──────────────────────────────────────────────────────
create or replace function public.is_sangria_member()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() ->> 'email') ilike '%@sangria.agency',
    false
  );
$$;

-- ─── Tasks: open up to the team ─────────────────────────────────────────
drop policy if exists "own tasks" on public.tasks;
create policy "team tasks read"
  on public.tasks
  for select
  using (public.is_sangria_member());
-- Insert requires the row's user_id to match the inserter (so 'created_by'
-- stays truthful), but anyone on the team can update / delete.
create policy "team tasks insert"
  on public.tasks
  for insert
  with check (public.is_sangria_member() and auth.uid() = user_id);
create policy "team tasks update"
  on public.tasks
  for update
  using (public.is_sangria_member())
  with check (public.is_sangria_member());
create policy "team tasks delete"
  on public.tasks
  for delete
  using (public.is_sangria_member());

-- ─── OOO entries: same shape ────────────────────────────────────────────
drop policy if exists "own ooo entries" on public.ooo_entries;
create policy "team ooo read"
  on public.ooo_entries
  for select
  using (public.is_sangria_member());
create policy "team ooo insert"
  on public.ooo_entries
  for insert
  with check (public.is_sangria_member() and auth.uid() = user_id);
create policy "team ooo update"
  on public.ooo_entries
  for update
  using (public.is_sangria_member())
  with check (public.is_sangria_member());
create policy "team ooo delete"
  on public.ooo_entries
  for delete
  using (public.is_sangria_member());

-- ─── task_assignees ─────────────────────────────────────────────────────
-- member_key is the slug from TEAM_MEMBERS in lib/team/members.ts
-- ('sofi','andre','dave','chelo','herman','sergio','ine','axel','mariano').
create table public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_key text not null,
  assigned_at timestamptz default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key (task_id, member_key)
);

create index task_assignees_member_idx on public.task_assignees (member_key);
create index task_assignees_task_idx on public.task_assignees (task_id);

alter table public.task_assignees enable row level security;

create policy "team assignees read"
  on public.task_assignees
  for select
  using (public.is_sangria_member());
create policy "team assignees write"
  on public.task_assignees
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());

-- ─── task_comments ──────────────────────────────────────────────────────
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index task_comments_task_idx
  on public.task_comments (task_id, created_at desc);

create trigger task_comments_updated_at
before update on public.task_comments
for each row execute function public.set_updated_at();

alter table public.task_comments enable row level security;

create policy "team comments read"
  on public.task_comments
  for select
  using (public.is_sangria_member());
-- Insert: must be team AND author = self (no impersonation).
create policy "team comments insert"
  on public.task_comments
  for insert
  with check (public.is_sangria_member() and auth.uid() = author_user_id);
-- Update / delete: only the comment's own author can edit / remove it.
create policy "team comments update"
  on public.task_comments
  for update
  using (public.is_sangria_member() and auth.uid() = author_user_id)
  with check (public.is_sangria_member() and auth.uid() = author_user_id);
create policy "team comments delete"
  on public.task_comments
  for delete
  using (public.is_sangria_member() and auth.uid() = author_user_id);

-- ─── task_activity ──────────────────────────────────────────────────────
-- One row per atomic action. payload jsonb stores action-specific data so
-- the global feed can render rich entries without per-shape joins.
create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in (
    'created','updated','status_changed','assigned','unassigned',
    'commented','deleted'
  )),
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index task_activity_task_idx
  on public.task_activity (task_id, created_at desc);
create index task_activity_recent_idx
  on public.task_activity (created_at desc);

alter table public.task_activity enable row level security;

create policy "team activity read"
  on public.task_activity
  for select
  using (public.is_sangria_member());
create policy "team activity write"
  on public.task_activity
  for insert
  with check (public.is_sangria_member());
