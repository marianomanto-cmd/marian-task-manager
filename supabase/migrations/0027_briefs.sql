-- Briefs: "Brief soporte PAGO en Redes Sociales" (paid social-media boosting
-- briefs). Mariano uploads the PDF, Claude reads it and extracts a
-- media-planning table; the team can edit, copy and export the result.
-- Team-shared: any signed-in agency member can read and write.

create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  campaign_name text not null default '',
  start_date text not null default '',
  end_date text not null default '',
  markets text not null default '',
  objective text not null default '',
  investment text not null default '',
  kpi text not null default '',
  kpi_goals text not null default '',
  link text not null default '',
  background text not null default '',
  target_audience text not null default '',
  social_networks text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefs_created_idx on public.briefs (created_at desc);

create or replace function public.set_briefs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists briefs_updated_at on public.briefs;
create trigger briefs_updated_at
  before update on public.briefs
  for each row execute function public.set_briefs_updated_at();

alter table public.briefs enable row level security;

-- Team-shared: any agency member can read and write.
drop policy if exists "briefs all" on public.briefs;
create policy "briefs all" on public.briefs
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());
