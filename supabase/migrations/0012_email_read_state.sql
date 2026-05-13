-- Mirror Gmail's UNREAD label state so the inbox can show read/unread.
-- Default false: a row's read state stays unknown until sync sets it from
-- the gmail label list. New rows inserted by syncGmailAction will write
-- this value at insert time.
alter table public.emails
  add column if not exists is_read boolean default false;

create index if not exists emails_user_read_idx
  on public.emails (user_id, is_read);
