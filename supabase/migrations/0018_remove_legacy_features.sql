-- Cleanup: drop Gmail/email, calendar, agenda (OOO + holidays), Slack, and
-- saved filter scaffolding. v2 of the app only keeps tasks and the new
-- project_items board.

-- Drop email-derived tables first (FKs reference these from tasks).
alter table public.tasks drop column if exists email_id;

drop table if exists public.email_ai cascade;
drop table if exists public.emails cascade;
drop table if exists public.sync_log cascade;
drop table if exists public.saved_filters cascade;

-- Calendar / agenda scaffolding.
drop table if exists public.calendar_events cascade;
drop table if exists public.meetings cascade;
drop table if exists public.ooo_entries cascade;
drop table if exists public.holidays cascade;

-- Old projects/clients (different from new project_items board).
drop table if exists public.projects cascade;
drop table if exists public.clients cascade;

-- user_settings: keep the row for activity-feed read-state, but drop the
-- Gmail/Calendar columns that no longer apply.
alter table public.user_settings drop column if exists gmail_history_id;
alter table public.user_settings drop column if exists gmail_refresh_token;
alter table public.user_settings drop column if exists last_synced_at;
alter table public.user_settings drop column if exists calendar_history_id;
alter table public.user_settings drop column if exists theme_preference;
