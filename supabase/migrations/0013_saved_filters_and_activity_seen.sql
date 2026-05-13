-- last_seen_activity_at on user_settings: drives the unseen-activity dot
-- on the header bell. Set to now() when the user opens the activity sheet.
alter table public.user_settings
  add column if not exists last_seen_activity_at timestamptz;

-- saved_filters: per-user named filter presets for the inbox.
-- criteria is a free-form jsonb that mirrors the InboxFilter shape so the
-- UI can evolve without migrations.
create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists saved_filters_user_idx
  on public.saved_filters (user_id, created_at desc);

alter table public.saved_filters enable row level security;

create policy "own saved filters"
  on public.saved_filters
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
