-- task_images: images pasted into a task (Ctrl+V). Binaries live in a
-- private Storage bucket; this table is the index. Served via short-lived
-- signed URLs so they render inline without being publicly reachable.

insert into storage.buckets (id, name, public)
values ('task-images', 'task-images', false)
on conflict (id) do nothing;

create table public.task_images (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  storage_path text not null,
  mime text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index task_images_task_idx
  on public.task_images (task_id, created_at);

alter table public.task_images enable row level security;

create policy "team task images read"
  on public.task_images
  for select
  using (public.is_sangria_member());
create policy "team task images write"
  on public.task_images
  for all
  using (public.is_sangria_member())
  with check (public.is_sangria_member());

-- Storage object policies, scoped to the task-images bucket. The team-wide
-- check mirrors the task tables — anyone on the team can read/manage them.
create policy "team task images storage read"
  on storage.objects
  for select
  using (bucket_id = 'task-images' and public.is_sangria_member());
create policy "team task images storage insert"
  on storage.objects
  for insert
  with check (bucket_id = 'task-images' and public.is_sangria_member());
create policy "team task images storage delete"
  on storage.objects
  for delete
  using (bucket_id = 'task-images' and public.is_sangria_member());
