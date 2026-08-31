export type TimelineItemKind = "task" | "milestone";

export type Timeline = {
  id: string;
  name: string;
  position: number;
  weekends_enabled: boolean;
  /** Subset of HOLIDAY_COUNTRY codes to highlight on the grid. */
  holiday_countries: string[];
  /**
   * Public read-only link (`/t/<share_token>`). Null while the timeline isn't
   * shared. Only reaches signed-in members — the public view never sees it.
   */
  share_token: string | null;
};

/** A timeline as seen through a share link: no token, no internal columns. */
export type PublicTimeline = {
  id: string;
  name: string;
  weekends_enabled: boolean;
  holiday_countries: string[];
  /** Last edit to the timeline row itself, ISO. */
  updated_at: string;
};

export type TimelineGroup = {
  id: string;
  timeline_id: string;
  name: string;
  position: number;
};

export type TimelineItem = {
  id: string;
  timeline_id: string;
  group_id: string | null;
  title: string;
  /** Owner type code: see TIMELINE_OWNERS. */
  owner_key: string | null;
  /** YYYY-MM-DD, inclusive. For milestones, end_date === start_date. */
  start_date: string;
  end_date: string;
  kind: TimelineItemKind;
  position: number;
};

/** Everything a public share link renders, in one snapshot. */
export type PublicTimelineData = {
  timeline: PublicTimeline;
  groups: TimelineGroup[];
  items: TimelineItem[];
  holidays: Holiday[];
  /** When the server read this snapshot, ISO — drives the "updated" stamp. */
  fetched_at: string;
};

export type TimelineOwner = "sangria" | "client" | "third_party";

export type TimelineOwnerInfo = {
  code: TimelineOwner;
  label: string;
  /** Bar fill + text classes. */
  barBg: string;
  barText: string;
  /** Solid dot/swatch class. */
  dot: string;
  /** ARGB-friendly hex (no #) for the Excel export. */
  hex: string;
};

export const TIMELINE_OWNERS: readonly TimelineOwnerInfo[] = [
  {
    code: "sangria",
    label: "Sangria",
    barBg: "bg-rose-800",
    barText: "text-rose-50",
    dot: "bg-rose-800",
    hex: "9F1239",
  },
  {
    code: "client",
    label: "Client",
    barBg: "bg-emerald-600",
    barText: "text-emerald-50",
    dot: "bg-emerald-600",
    hex: "059669",
  },
  {
    code: "third_party",
    label: "Third Party",
    barBg: "bg-amber-400",
    barText: "text-amber-950",
    dot: "bg-amber-400",
    hex: "FBBF24",
  },
] as const;

const OWNER_BY_CODE = new Map(TIMELINE_OWNERS.map((o) => [o.code, o]));

export function ownerInfo(code: string | null): TimelineOwnerInfo | null {
  if (!code) return null;
  return OWNER_BY_CODE.get(code as TimelineOwner) ?? null;
}

export type Holiday = {
  country: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
};

export type HolidayCountry = {
  code: string;
  label: string;
  /** Day-column tint in the header / body, day-number text, dot + toggle chip. */
  header: string;
  body: string;
  text: string;
  dot: string;
  chip: string;
};

export const HOLIDAY_COUNTRIES: readonly HolidayCountry[] = [
  {
    code: "AR",
    label: "Argentina",
    header: "bg-emerald-500/25",
    body: "bg-emerald-500/12",
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
  },
  {
    code: "PA",
    label: "Panamá",
    header: "bg-violet-500/25",
    body: "bg-violet-500/12",
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    chip: "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-200",
  },
  {
    code: "US",
    label: "EE.UU.",
    header: "bg-indigo-500/25",
    body: "bg-indigo-500/12",
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500",
    chip: "border-indigo-500/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200",
  },
  {
    code: "ES",
    label: "España",
    header: "bg-rose-500/25",
    body: "bg-rose-500/12",
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-700 dark:text-rose-200",
  },
] as const;
