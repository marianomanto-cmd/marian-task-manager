-- task_notified: people kept in the loop on a task without owning it.
-- Same key-based shape as task_assignees (member_key is the slug from
-- TEAM_MEMBERS in lib/team/members.ts) and the same team-wide RLS. A task
-- can move people between assigned and notified as it changes hands.

create table public.task_notified (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_key text not null,
  notified_at timestamptz default now(),
  notified_by uuid references auth.users(id) on delete set null,
  primary key (task_id, member_key)
);

create index task_notified_member_idx on public.task_notified (member_key);
create index task_notified_task_idx on public.task_notified (task_id);

alter table public.task_notified enable row level security;

create policy "team notified read"
  on public.task_notified
  for select
  using (public.is_sangria_member());
create policy "team notified write"
  on public.task_notified
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());
