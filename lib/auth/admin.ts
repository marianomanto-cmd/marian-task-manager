/**
 * Admin = Mariano. Owns the personal Projects board.
 * Configured via ADMIN_EMAIL env var; unset means no one is admin.
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
