-- link: optional free-form text for a related URL (Drive, Notion, Figma,
-- anything). Not validated server-side; the UI shows it as a clickable
-- chip when it parses as a URL.
alter table public.tasks
  add column if not exists link text;
