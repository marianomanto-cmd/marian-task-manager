export type HolidayCountry = "AR" | "PA" | "US" | "ES";

export type Holiday = {
  id: number;
  country: HolidayCountry;
  /** YYYY-MM-DD (date column from Postgres). */
  date: string;
  name: string;
};

export const HOLIDAY_COUNTRY_META: Record<
  HolidayCountry,
  {
    label: string;
    /** Solid dot bg, used in legend + day-detail sheet. */
    color: string;
    /** Tinted chip bg + text for inline grid labels. */
    chip: string;
  }
> = {
  AR: {
    label: "Argentina",
    color: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-200 border-sky-500/30",
  },
  PA: {
    label: "Panamá",
    color: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-200 border-rose-500/30",
  },
  US: {
    label: "Estados Unidos",
    color: "bg-indigo-500",
    chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200 border-indigo-500/30",
  },
  ES: {
    label: "España",
    color: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-200 border-amber-500/30",
  },
};
