-- OOO (Out Of Office) entries for the Agenda tab.
-- Single-user app today: member_name is free text (no employee catalog).

create table public.ooo_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint ooo_entries_date_range_chk check (end_date >= start_date)
);

create index ooo_entries_user_range_idx
  on public.ooo_entries (user_id, start_date, end_date);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger ooo_entries_updated_at
before update on public.ooo_entries
for each row execute function public.set_updated_at();

alter table public.ooo_entries enable row level security;

create policy "own ooo entries"
  on public.ooo_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
