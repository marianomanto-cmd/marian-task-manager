/**
 * Public client links live at the root of the app (`/copa`, `/cmi`, …), so a
 * client slug competes for URL space with the app's own routes. These helpers
 * keep the two apart. The reserved list mirrors the one in
 * `supabase/migrations/0028_client_public_links.sql` — keep both in sync.
 */

export const RESERVED_SLUGS: readonly string[] = [
  "tasks",
  "projects",
  "briefs",
  "timeliner",
  "todos",
  "login",
  "logout",
  "auth",
  "api",
  "p",
  "admin",
  "settings",
  "share",
  "public",
  "static",
  "favicon",
  "boardmely",
  "boardyiss",
  "boardmafe",
  "boardnadine",
] as const;

export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 40;

/** The `/todos` link: every client on one page, for the team. */
export const ALL_CLIENTS_SLUG = "todos";

const ACCENTS = "áàäâãåÁÀÄÂÃÅéèëêÉÈËÊíìïîÍÌÏÎóòöôõÓÒÖÔÕúùüûÚÙÜÛñÑçÇ";
const PLAIN = "aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUnNcC";

/** Mirror of the SQL `public.slugify()` so the UI can preview a slug. */
export function slugify(value: string): string {
  let folded = "";
  for (const char of value) {
    const at = ACCENTS.indexOf(char);
    folded += at === -1 ? char : PLAIN[at];
  }
  return folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.includes(slug.toLowerCase());
}

export type SlugCheck = { ok: true; slug: string } | { ok: false; message: string };

/**
 * Validate a slug typed by the admin. Returns the normalised value so callers
 * can store exactly what the URL will contain.
 */
export function checkSlug(input: string): SlugCheck {
  const slug = input.trim().toLowerCase();

  if (slug.length === 0) {
    return { ok: false, message: "Falta el link del cliente" };
  }
  if (slug.length < SLUG_MIN_LENGTH) {
    return { ok: false, message: `El link necesita al menos ${SLUG_MIN_LENGTH} caracteres` };
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return { ok: false, message: `El link no puede superar los ${SLUG_MAX_LENGTH} caracteres` };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return {
      ok: false,
      message: "Usá sólo letras, números y guiones (sin espacios ni acentos)",
    };
  }
  if (isReservedSlug(slug)) {
    return { ok: false, message: `"${slug}" está reservado por la app. Elegí otro.` };
  }
  return { ok: true, slug };
}
