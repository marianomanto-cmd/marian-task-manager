-- Tasks table. project_id and email_id columns reserve forward compatibility
-- for the projects + emails tables that arrive in later fases; FK constraints
-- get added in a follow-up migration once those tables exist.
--
-- Deviates from SPEC.md by using `date` instead of `timestamptz` for due_date:
-- agency tasks are wall-clock day commitments (not specific moments) and a
-- date column avoids the UTC-midnight-renders-as-previous-day pitfall.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  email_id uuid,
  title text not null,
  notes text,
  status text not null default 'todo'
    check (status in ('todo','in_progress','review','done')),
  priority text not null default 'medium'
    check (priority in ('low','medium','high')),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index tasks_user_status_idx on public.tasks (user_id, status);
create index tasks_due_idx on public.tasks (due_date)
  where due_date is not null;

-- Reuses public.set_updated_at() created in migration 0005.
create trigger tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "own tasks"
  on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
