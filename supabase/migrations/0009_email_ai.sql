-- AI classification stored separately from emails so the wall-clock
-- email row is never modified by Claude — the LEFT JOIN ... WHERE
-- email_ai.email_id IS NULL query in syncGmailAction is what guarantees
-- a mail is never reprocessed. prompt_version makes it explicit: changing
-- the prompt requires bumping the version string AND keeping the old
-- analyses intact (delete them manually from SQL editor if you want a
-- reprocess pass).

create table public.email_ai (
  email_id uuid primary key references public.emails(id) on delete cascade,
  category text check (category in (
    'URGENTE','CLIENTE','PROVEEDOR','INTERNO','INFORMATIVO','OTROS'
  )),
  summary text,
  priority int check (priority between 0 and 100),
  campaign_code text,
  detected_deadline timestamptz,
  suggested_action text check (suggested_action in (
    'responder','crear_tarea','archivar','derivar'
  )),
  requires_response boolean,
  model_version text not null,
  prompt_version text not null,
  tokens_input int,
  tokens_output int,
  processed_at timestamptz default now()
);

create index email_ai_category_idx on public.email_ai (category);
create index email_ai_priority_idx on public.email_ai (priority desc);
create index email_ai_campaign_idx
  on public.email_ai (campaign_code)
  where campaign_code is not null;

alter table public.email_ai enable row level security;

-- No user_id column — owner comes from the parent email row.
create policy "own email_ai"
  on public.email_ai
  for all
  using (
    exists (
      select 1 from public.emails e
      where e.id = email_ai.email_id and e.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.emails e
      where e.id = email_ai.email_id and e.user_id = auth.uid()
    )
  );
