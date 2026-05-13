/**
 * Hardcoded list of team members who can be assigned to tasks.
 * `key` is a stable slug stored in `task_assignees.member_key`; renaming a
 * person's display name doesn't break old rows.
 *
 * Each member also gets a `colorIndex` into a fixed palette so chips and
 * OOO bars stay consistent across the app.
 */
export type TeamMember = {
  key: string;
  name: string;
  email: string;
  colorIndex: number;
  /**
   * Slack member ID (e.g. "U07ABCDEF"). When set we render an @mention in
   * Slack notifications, otherwise we fall back to the display name.
   * Get it in Slack: profile → "More" → "Copy member ID".
   */
  slackUserId?: string;
};

const PALETTE: Array<{ chipBg: string; chipText: string; barBg: string; barText: string }> = [
  {
    chipBg: "bg-sky-500/15 text-sky-700 dark:text-sky-200 border-sky-500/40",
    chipText: "text-sky-700",
    barBg: "bg-sky-500/80",
    barText: "text-sky-50",
  },
  {
    chipBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-emerald-500/40",
    chipText: "text-emerald-700",
    barBg: "bg-emerald-500/80",
    barText: "text-emerald-50",
  },
  {
    chipBg: "bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/40",
    chipText: "text-amber-700",
    barBg: "bg-amber-500/80",
    barText: "text-amber-50",
  },
  {
    chipBg: "bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-500/40",
    chipText: "text-rose-700",
    barBg: "bg-rose-500/80",
    barText: "text-rose-50",
  },
  {
    chipBg: "bg-violet-500/15 text-violet-700 dark:text-violet-200 border-violet-500/40",
    chipText: "text-violet-700",
    barBg: "bg-violet-500/80",
    barText: "text-violet-50",
  },
  {
    chipBg: "bg-teal-500/15 text-teal-700 dark:text-teal-200 border-teal-500/40",
    chipText: "text-teal-700",
    barBg: "bg-teal-500/80",
    barText: "text-teal-50",
  },
  {
    chipBg: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200 border-fuchsia-500/40",
    chipText: "text-fuchsia-700",
    barBg: "bg-fuchsia-500/80",
    barText: "text-fuchsia-50",
  },
  {
    chipBg: "bg-orange-500/15 text-orange-700 dark:text-orange-200 border-orange-500/40",
    chipText: "text-orange-700",
    barBg: "bg-orange-500/80",
    barText: "text-orange-50",
  },
  {
    chipBg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200 border-indigo-500/40",
    chipText: "text-indigo-700",
    barBg: "bg-indigo-500/80",
    barText: "text-indigo-50",
  },
];

export const TEAM_MEMBERS: readonly TeamMember[] = [
  { key: "sofi", name: "Sofi", email: "media@sangria.agency", colorIndex: 0 },
  { key: "andre", name: "Andre", email: "andreyna.peraza@sangria.agency", colorIndex: 1 },
  { key: "dave", name: "Dave", email: "david.lopez@sangria.agency", colorIndex: 2 },
  { key: "chelo", name: "Chelo", email: "marcelo.boasso@sangria.agency", colorIndex: 3 },
  { key: "herman", name: "Herman", email: "herman.grabosky@sangria.agency", colorIndex: 4 },
  { key: "sergio", name: "Sergio", email: "sergio.barrientos@sangria.agency", colorIndex: 5 },
  { key: "ine", name: "Ine", email: "ines.echavarria@sangria.agency", colorIndex: 6 },
  { key: "axel", name: "Axel", email: "axel.nieves@sangria.agency", colorIndex: 7 },
  { key: "marian", name: "Marian", email: "mariano.mantovani@sangria.agency", colorIndex: 8 },
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

export function displayNameForEmail(email: string | null | undefined): string {
  const member = getMemberByEmail(email);
  if (member) return member.name;
  if (!email) return "alguien";
  const local = email.split("@")[0];
  return local.length > 0 ? local : email;
}

export function colorForMemberKey(key: string): {
  chipBg: string;
  barBg: string;
  barText: string;
} {
  const member = BY_KEY.get(key);
  const palette = member
    ? PALETTE[member.colorIndex % PALETTE.length]
    : PALETTE[0];
  return {
    chipBg: palette.chipBg,
    barBg: palette.barBg,
    barText: palette.barText,
  };
}
