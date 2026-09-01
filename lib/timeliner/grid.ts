import { format } from "date-fns";
import { es } from "date-fns/locale";

import {
  HOLIDAY_COUNTRIES,
  ownerInfo,
  type Holiday,
  type HolidayCountry,
} from "@/lib/timeliner/types";

/**
 * Shared chart vocabulary: the palette and the date maths that the SVAR-based
 * Gantt (`components/timeliner/svar-gantt-inner.tsx`) and the cross-timeline
 * MASTER view (`components/timeliner/master-view.tsx`) both read from, so a
 * weekend, a holiday and an owner look the same wherever they are drawn.
 *
 * Everything here is pure. The Gantt's own geometry — bar positions, elbows,
 * arrowheads — belongs to SVAR now; what stays is what SVAR has no opinion
 * about: which days this agency tints, and in what colour.
 */

/** Row height, also the height of the MASTER lanes and the chart's loader. */
export const ROW_H = 40;

export const WEEKEND_BODY = "bg-slate-500/15";
export const TODAY_HEADER = "bg-sky-400/30";
export const TODAY_BODY = "bg-sky-400/15";
export const TODAY_TEXT = "text-sky-600 dark:text-sky-300 font-bold";

/** First country (in list order) with a holiday on this date. */
export function firstHolidayColor(countries: string[]): HolidayCountry | null {
  for (const c of HOLIDAY_COUNTRIES) if (countries.includes(c.code)) return c;
  return null;
}

export function ownerColors(ownerKey: string | null) {
  const info = ownerInfo(ownerKey);
  return info
    ? { barBg: info.barBg, barText: info.barText }
    : { barBg: "bg-slate-400", barText: "text-white" };
}

export type HolidayEntry = { countries: string[]; names: string[] };

/** Holidays by ISO date, keeping only the countries this timeline highlights. */
export function buildHolidayMap(
  holidays: readonly Holiday[],
  enabledCountries: readonly string[],
): Map<string, HolidayEntry> {
  const m = new Map<string, HolidayEntry>();
  for (const h of holidays) {
    if (!enabledCountries.includes(h.country)) continue;
    const entry = m.get(h.date) ?? { countries: [], names: [] };
    entry.countries.push(h.country);
    entry.names.push(`${h.country}: ${h.name}`);
    m.set(h.date, entry);
  }
  return m;
}

export type MonthSegment = { label: string; left: number; width: number };

/** Month bands across the top of the MASTER grid. */
export function buildMonthSegments(
  days: readonly Date[],
  dayW: number,
): MonthSegment[] {
  const segs: MonthSegment[] = [];
  let i = 0;
  while (i < days.length) {
    const m = days[i].getMonth();
    let j = i;
    while (j < days.length && days[j].getMonth() === m) j++;
    const label = format(days[i], "MMMM yyyy", { locale: es });
    segs.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      left: i * dayW,
      width: (j - i) * dayW,
    });
    i = j;
  }
  return segs;
}
