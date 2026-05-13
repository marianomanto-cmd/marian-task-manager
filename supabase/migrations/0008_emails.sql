-- Gmail sync schema: user_settings (sync cursor), emails (synced mails),
-- sync_log (audit + future cost tracking). No AI columns yet — those land
-- with email_ai in a later migration.
--
-- gmail_refresh_token column reserved but unused in Fase 2: today we read
-- session.provider_token directly (manual-sync friendly, expires at ~1h).

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gmail_history_id text,
  last_synced_at timestamptz,
  gmail_refresh_token text,
  theme_preference text default 'system'
    check (theme_preference in ('system','light','dark')),
  created_at timestamptz default now()
);

alter table public.user_settings enable row level security;

create policy "own settings"
  on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Emails ─────────────────────────────────────────────────────────────
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text not null,
  project_id uuid, -- FK added when projects table lands
  sender_name text,
  sender_email text,
  subject text,
  snippet text,
  body_preview text,
  received_at timestamptz not null,
  has_attachments boolean default false,
  attachments_meta jsonb,
  is_archived boolean default false,
  created_at timestamptz default now(),
  unique (user_id, gmail_message_id)
);

create index emails_user_received_idx
  on public.emails (user_id, received_at desc);
create index emails_thread_idx on public.emails (gmail_thread_id);
create index emails_user_archived_idx
  on public.emails (user_id, is_archived);

alter table public.emails enable row level security;

create policy "own emails"
  on public.emails
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Sync log ───────────────────────────────────────────────────────────
create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz default now(),
  finished_at timestamptz,
  messages_fetched int default 0,
  messages_inserted int default 0,
  messages_processed_ai int default 0,
  messages_skipped_already_processed int default 0,
  total_tokens_input int default 0,
  total_tokens_output int default 0,
  estimated_cost_usd numeric(10,4) default 0,
  error text
);

create index sync_log_user_started_idx
  on public.sync_log (user_id, started_at desc);

alter table public.sync_log enable row level security;

create policy "own sync log"
  on public.sync_log
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
