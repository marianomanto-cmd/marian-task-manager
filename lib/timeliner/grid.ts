import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  max as dfMax,
  min as dfMin,
  parseISO,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";

import {
  HOLIDAY_COUNTRIES,
  ownerInfo,
  type Holiday,
  type HolidayCountry,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeliner/types";

/**
 * Geometry and grouping shared by the two Gantt renderers: the editable board
 * (`components/timeliner/gantt-chart.tsx`) and the read-only public view
 * (`components/timeliner/public-gantt.tsx`). Everything here is pure, so both
 * surfaces lay out the exact same grid — a client opening a share link sees
 * what the team sees.
 */

export const DAY_W = 32;
export const ROW_H = 40;
export const GROUP_H = 30;
export const LEFT_W = 288;

export const WEEKEND_HEADER = "bg-slate-500/25";
export const WEEKEND_BODY = "bg-slate-500/15";
export const TODAY_HEADER = "bg-sky-400/30";
export const TODAY_BODY = "bg-sky-400/15";
export const TODAY_TEXT = "text-sky-600 dark:text-sky-300 font-bold";

export const WEEKDAY = ["D", "L", "M", "M", "J", "V", "S"];

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

/**
 * The visible date window: every item's span padded to whole weeks, or four
 * weeks from today when the timeline is still empty.
 */
export function buildDayRange(
  items: readonly TimelineItem[],
  today: Date,
): { rangeStart: Date; days: Date[] } {
  const dates = items.flatMap((it) => [
    parseISO(it.start_date),
    parseISO(it.end_date),
  ]);
  const minD = dates.length ? dfMin(dates) : today;
  const maxD = dates.length ? dfMax(dates) : addDays(today, 28);
  const start = startOfWeek(addDays(minD, -3), { weekStartsOn: 1 });
  const end = endOfWeek(addDays(maxD, 5), { weekStartsOn: 1 });
  return { rangeStart: start, days: eachDayOfInterval({ start, end }) };
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

/**
 * Month bands across the top of the grid. `dayW` defaults to the timeline
 * chart's column width; MASTER passes its own so the same bands work zoomed
 * out.
 */
export function buildMonthSegments(
  days: readonly Date[],
  dayW: number = DAY_W,
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

/**
 * Manual vertical order is the source of truth: sort by `position` first so
 * drag-to-reorder persists, falling back to dates then id for stability.
 */
export function sortTimelineItems(
  items: readonly TimelineItem[],
): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.start_date !== b.start_date)
      return a.start_date < b.start_date ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export type TimelineRow =
  | { type: "group"; group: TimelineGroup | null; count: number }
  | { type: "item"; item: TimelineItem };

/**
 * Ordered render rows: group headers interleaved with their items, ungrouped
 * items last under a "Sin grupo" header. With no groups, items render flat.
 */
export function buildRows(
  sortedItems: readonly TimelineItem[],
  groups: readonly TimelineGroup[],
): TimelineRow[] {
  const out: TimelineRow[] = [];
  const byGroup = new Map<string | null, TimelineItem[]>();
  for (const it of sortedItems) {
    const k = it.group_id ?? null;
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(it);
  }
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  if (sortedGroups.length === 0) {
    for (const it of sortedItems) out.push({ type: "item", item: it });
    return out;
  }
  for (const g of sortedGroups) {
    const list = byGroup.get(g.id) ?? [];
    out.push({ type: "group", group: g, count: list.length });
    for (const it of list) out.push({ type: "item", item: it });
  }
  const ungrouped = byGroup.get(null) ?? [];
  if (ungrouped.length > 0) {
    out.push({ type: "group", group: null, count: ungrouped.length });
    for (const it of ungrouped) out.push({ type: "item", item: it });
  }
  return out;
}
