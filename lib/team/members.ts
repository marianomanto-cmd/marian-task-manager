/**
 * Hardcoded list of team members who can be assigned to tasks.
 * `key` is a stable slug stored in `task_assignees.member_key`; renaming a
 * person's display name doesn't break old rows. Update this file + redeploy
 * to add or remove people.
 *
 * Order here is the order they appear in the assignee selector.
 */
export type TeamMember = {
  key: string;
  name: string;
  email: string;
};

export const TEAM_MEMBERS: readonly TeamMember[] = [
  { key: "sofi", name: "Sofi", email: "media@sangria.agency" },
  { key: "andre", name: "Andre", email: "andreyna.peraza@sangria.agency" },
  { key: "dave", name: "Dave", email: "david.lopez@sangria.agency" },
  { key: "chelo", name: "Chelo", email: "marcelo.boasso@sangria.agency" },
  { key: "herman", name: "Herman", email: "herman.grabosky@sangria.agency" },
  { key: "sergio", name: "Sergio", email: "sergio.barrientos@sangria.agency" },
  { key: "ine", name: "Ine", email: "ines.echavarria@sangria.agency" },
  { key: "axel", name: "Axel", email: "axel.nieves@sangria.agency" },
] as const;

const BY_KEY = new Map<string, TeamMember>(
  TEAM_MEMBERS.map((m) => [m.key, m]),
);
const BY_EMAIL = new Map<string, TeamMember>(
  TEAM_MEMBERS.map((m) => [m.email.toLowerCase(), m]),
);

export function getMemberByKey(key: string): TeamMember | null {
  return BY_KEY.get(key) ?? null;
}

export function getMemberByEmail(email: string | null | undefined): TeamMember | null {
  if (!email) return null;
  return BY_EMAIL.get(email.toLowerCase()) ?? null;
}

/**
 * Returns the display name for a user identified by email — falls back to
 * the local-part of the email if the address isn't in the team list.
 * Used by the activity feed when the actor isn't a known team member.
 */
export function displayNameForEmail(email: string | null | undefined): string {
  const member = getMemberByEmail(email);
  if (member) return member.name;
  if (!email) return "alguien";
  const local = email.split("@")[0];
  return local.length > 0 ? local : email;
}
