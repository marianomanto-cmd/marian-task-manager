-- Denormalize the actor / author email onto task_activity and task_comments
-- so the UI can render "Sofi comentó: ..." without joining auth.users
-- (which isn't directly RLS-readable from the client).
alter table public.task_activity add column if not exists actor_email text;
alter table public.task_comments add column if not exists author_email text;

create index if not exists task_activity_actor_email_idx
  on public.task_activity (actor_email);
create index if not exists task_comments_author_email_idx
  on public.task_comments (author_email);
