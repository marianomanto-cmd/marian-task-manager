/**
 * Admin = Mariano. The user whose Gmail + Calendar tabs are visible.
 * Configured via ADMIN_EMAIL env var so the email isn't hardcoded in source.
 *
 * If ADMIN_EMAIL is unset, no one is treated as admin — fail closed.
 * Set it in Vercel → Project Settings → Environment Variables (and locally
 * in .env.local).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin || !email) return false;
  return email.toLowerCase() === admin.toLowerCase();
}

export function getAdminEmail(): string | null {
  return process.env.ADMIN_EMAIL ?? null;
}

const SANGRIA_DOMAIN = "@sangria.agency";

export function isSangriaEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith(SANGRIA_DOMAIN);
}
