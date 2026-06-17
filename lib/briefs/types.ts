/**
 * A brief row as stored in Supabase. The free-text columns are everything
 * Claude extracts from the PDF; the rest is identity/bookkeeping.
 */
export type Brief = {
  id: string;
  file_name: string | null;
  campaign_name: string;
  start_date: string;
  end_date: string;
  markets: string;
  objective: string;
  investment: string;
  kpi: string;
  kpi_goals: string;
  link: string;
  background: string;
  target_audience: string;
  social_networks: string;
  created_at: string;
  updated_at: string;
};

/** The fields Claude fills in — excludes db/identity columns. */
export type BriefFields = Pick<
  Brief,
  | "campaign_name"
  | "start_date"
  | "end_date"
  | "markets"
  | "objective"
  | "investment"
  | "kpi"
  | "kpi_goals"
  | "link"
  | "background"
  | "target_audience"
  | "social_networks"
>;

export type BriefColumn = {
  key: keyof BriefFields;
  label: string;
  /** Long free-text fields get a textarea in the editor + wider, clamped cells. */
  long?: boolean;
};

/**
 * Single source of truth for column order + labels, shared by the table, the
 * editor and the exports so they never drift apart. Order follows the brief
 * reading flow Mariano asked for.
 */
export const BRIEF_COLUMNS: readonly BriefColumn[] = [
  { key: "campaign_name", label: "Campaña" },
  { key: "start_date", label: "Start date" },
  { key: "end_date", label: "End date" },
  { key: "markets", label: "Mercados" },
  { key: "objective", label: "Objetivo" },
  { key: "investment", label: "Inversión" },
  { key: "kpi", label: "KPI" },
  { key: "kpi_goals", label: "Metas / Goals", long: true },
  { key: "link", label: "Link" },
  { key: "background", label: "Background / Overview", long: true },
  { key: "target_audience", label: "Target audience", long: true },
  { key: "social_networks", label: "Redes" },
] as const;

/** Column list for Supabase `.select()`. */
export const BRIEF_DB_COLUMNS =
  "id, file_name, campaign_name, start_date, end_date, markets, objective, investment, kpi, kpi_goals, link, background, target_audience, social_networks, created_at, updated_at";

export function emptyBriefFields(): BriefFields {
  return {
    campaign_name: "",
    start_date: "",
    end_date: "",
    markets: "",
    objective: "",
    investment: "",
    kpi: "",
    kpi_goals: "",
    link: "",
    background: "",
    target_audience: "",
    social_networks: "",
  };
}
