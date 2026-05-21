export type TimelineItemKind = "task" | "milestone";

export type Timeline = {
  id: string;
  name: string;
  position: number;
  weekends_enabled: boolean;
  /** Subset of HOLIDAY_COUNTRY codes to highlight on the grid. */
  holiday_countries: string[];
};

export type TimelineItem = {
  id: string;
  timeline_id: string;
  title: string;
  owner_key: string | null;
  /** YYYY-MM-DD, inclusive. For milestones, end_date === start_date. */
  start_date: string;
  end_date: string;
  kind: TimelineItemKind;
  position: number;
};

export type Holiday = {
  country: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
};

export const HOLIDAY_COUNTRIES: readonly { code: string; label: string }[] = [
  { code: "AR", label: "Argentina" },
  { code: "PA", label: "Panamá" },
  { code: "US", label: "EE.UU." },
  { code: "ES", label: "España" },
] as const;
