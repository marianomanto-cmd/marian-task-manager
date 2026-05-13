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
  { label: string; color: string }
> = {
  AR: { label: "Argentina", color: "bg-sky-500" },
  PA: { label: "Panamá", color: "bg-rose-500" },
  US: { label: "Estados Unidos", color: "bg-indigo-500" },
  ES: { label: "España", color: "bg-amber-500" },
};
