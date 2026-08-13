-- Public per-client links: every client on the Projects board gets its own
-- short URL (/copa, /cmi, …) that anyone can open without logging in and that
-- shows ONLY that client's projects and tasks. A second link (/todos) shows
-- the whole board.
--
-- The underlying tables stay locked down by RLS (agency members only). Public
-- access goes exclusively through the SECURITY DEFINER functions at the bottom
-- of this file, which take a slug and filter by it server-side — so a client
-- link can never return another client's rows, whatever the caller does.

-- ---------------------------------------------------------------------------
-- 1. slugify(): accent-folding text -> url-slug. `unaccent` isn't installed on
--    this project, so the common Spanish/Portuguese accents are folded with
--    translate() (both argument strings are 50 chars, kept in sync by hand).
-- ---------------------------------------------------------------------------

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(
        translate(
          coalesce(value, ''),
          'áàäâãåÁÀÄÂÃÅéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑçÇ',
          'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNcC'
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. clients.slug — the public URL segment for each client.
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists slug text;

-- Slugs live in the app's root URL namespace, so they have to be unique across
-- the whole table, not just per owner.
create unique index if not exists clients_slug_idx
  on public.clients (slug)
  where slug is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_slug_format'
  ) then
    alter table public.clients
      add constraint clients_slug_format
      check (
        slug is null
        or (slug ~ '^[a-z0-9][a-z0-9-]*$' and length(slug) between 2 and 40)
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill. Prefer the short first word ("Copa Airlines" -> copa, "CMI" ->
--    cmi, "Félix" -> felix); fall back to the full name, then to a numeric
--    suffix, if that is taken or collides with an app route.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  reserved text[] := array[
    'tasks', 'projects', 'briefs', 'timeliner', 'todos', 'login', 'logout',
    'auth', 'api', 'p', 'admin', 'settings', 'share', 'public', 'static',
    'favicon', 'boardmely', 'boardyiss', 'boardmafe', 'boardnadine'
  ];
  base text;
  candidate text;
  n integer;
begin
  for r in
    select user_id, name from public.clients where slug is null
    order by position, name
  loop
    base := public.slugify(split_part(r.name, ' ', 1));
    if base = '' or base = any(reserved) or length(base) < 2 then
      base := public.slugify(r.name);
    end if;
    if base = '' or length(base) < 2 then
      base := 'board';
    end if;

    candidate := base;
    n := 1;
    while candidate = any(reserved)
       or exists (select 1 from public.clients where slug = candidate)
    loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;

    update public.clients
      set slug = candidate
      where user_id = r.user_id and name = r.name;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Public read API.
--
--    Each function takes p_slug:
--      * a client slug -> only that client's rows (what a client link uses)
--      * null          -> the whole board (what /todos uses)
--
--    SECURITY DEFINER to bypass RLS, `stable` because they only read, and
--    `set search_path = public` so the body can't be redirected by a caller's
--    search_path. Nothing internal is exposed: no user_id, no archived rows.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_board_clients(p_slug text default null)
returns table (
  name text,
  slug text,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.slug, c."position"
  from public.clients c
  where c.slug is not null
    and (p_slug is null or c.slug = lower(p_slug))
  order by c."position" asc, c.name asc;
$$;

create or replace function public.get_public_board_meta(p_slug text default null)
returns table (
  project text,
  client text,
  color text,
  emoji text,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select pm.project, pm.client, pm.color, pm.emoji, pm."position"
  from public.projects_meta pm
  where p_slug is null
     or pm.client in (
          select c.name
          from public.clients c
          where c.user_id = pm.user_id and c.slug = lower(p_slug)
        )
  order by pm."position" asc, pm.project asc;
$$;

create or replace function public.get_public_board_items(p_slug text default null)
returns table (
  id uuid,
  project text,
  client text,
  title text,
  description text,
  category text,
  status text,
  due_date date,
  link text,
  "position" integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pi.id, pi.project, pm.client, pi.title, pi.description, pi.category,
    pi.status, pi.due_date, pi.link, pi."position"
  from public.project_items pi
  -- left join: a project with no metadata row still shows up on /todos. For a
  -- client-scoped call the metadata row is what carries the client, so those
  -- projects are filtered out below, which is what we want.
  left join public.projects_meta pm
    on pm.user_id = pi.user_id and pm.project = pi.project
  where pi.archived_at is null
    and (
      p_slug is null
      or pm.client in (
           select c.name
           from public.clients c
           where c.user_id = pi.user_id and c.slug = lower(p_slug)
         )
    )
  order by
    coalesce(pm."position", 1000000) asc,
    pi.project asc,
    pi."position" asc,
    pi.created_at asc;
$$;

-- Let unauthenticated visitors call them — that is the whole point of the
-- public links. The functions themselves are the security boundary.
grant execute on function public.get_public_board_clients(text) to anon, authenticated;
grant execute on function public.get_public_board_meta(text) to anon, authenticated;
grant execute on function public.get_public_board_items(text) to anon, authenticated;
