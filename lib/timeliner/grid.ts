import {
  addDays,
  differenceInCalendarDays,
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

/** Month bands across the top of the grid. */
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

/* -------------------------------------------------------------------------
 * Dependency arrows
 *
 * Geometry only — no React, no DOM. The editable board and the read-only
 * public view both draw their arrows from these numbers, so a client following
 * a share link sees the same chain, routed identically, as the team.
 * ---------------------------------------------------------------------- */

/** Half-height of a task bar; also how far a milestone diamond sticks out. */
const BAR_H = ROW_H - 16;
const MILESTONE_R = 7;
/** How far a link runs straight out of a bar before it is allowed to turn. */
const STUB = 12;
/** Corner radius of the elbows. */
const ELBOW_R = 6;

export type RowLayout = {
  /** Top edge of each item's row, in grid pixels. */
  topById: Map<string, number>;
  /** Full body height, so the arrow overlay can size itself. */
  height: number;
};

/** Vertical offsets of every rendered row, in the order `buildRows` returns. */
export function buildRowLayout(rows: readonly TimelineRow[]): RowLayout {
  const topById = new Map<string, number>();
  let y = 0;
  for (const row of rows) {
    if (row.type === "group") {
      y += GROUP_H;
      continue;
    }
    topById.set(row.item.id, y);
    y += ROW_H;
  }
  return { topById, height: y };
}

export type ItemAnchors = {
  /** Left tip — the item's start. */
  startX: number;
  /** Right tip — the item's finish. */
  endX: number;
  /** Vertical centre of the bar within its row. */
  midY: number;
  /** Bar top/bottom, for the hover handles. */
  top: number;
  bottom: number;
};

/**
 * Where a link can attach to an item: the two tips of its bar, or the two
 * corners of a milestone diamond. Matches what the renderers actually draw —
 * bars inset by 2px, diamonds centred in their day column.
 */
export function itemAnchors(
  item: Pick<TimelineItem, "start_date" | "end_date" | "kind">,
  rangeStart: Date,
  rowTop: number,
  dayW: number = DAY_W,
): ItemAnchors {
  const startIdx = differenceInCalendarDays(parseISO(item.start_date), rangeStart);
  const midY = rowTop + ROW_H / 2;
  if (item.kind === "milestone") {
    const cx = startIdx * dayW + dayW / 2;
    return {
      startX: cx - MILESTONE_R,
      endX: cx + MILESTONE_R,
      midY,
      top: midY - MILESTONE_R,
      bottom: midY + MILESTONE_R,
    };
  }
  const span =
    differenceInCalendarDays(parseISO(item.end_date), parseISO(item.start_date)) + 1;
  const left = startIdx * dayW + 2;
  const width = Math.max(dayW - 4, span * dayW - 4);
  return {
    startX: left,
    endX: left + width,
    midY,
    top: midY - BAR_H / 2,
    bottom: midY + BAR_H / 2,
  };
}

type Point = [number, number];

/**
 * An elbow route from one tip to another: straight out of the source, one
 * vertical run, straight into the target. A link that doubles back (the
 * successor sits to the left of its predecessor) needs the extra dogleg
 * through the gap between the rows, so it never runs along a bar.
 */
function routePoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  fromSide: "start" | "end",
  toSide: "start" | "end",
): Point[] {
  const ex = fromSide === "end" ? sx + STUB : sx - STUB;
  const nx = toSide === "start" ? tx - STUB : tx + STUB;
  const forward = fromSide === "end" ? nx >= ex : nx <= ex;
  if (forward) return [[sx, sy], [nx, sy], [nx, ty], [tx, ty]];
  const midY = sy === ty ? sy + ROW_H / 2 : (sy + ty) / 2;
  return [[sx, sy], [ex, sy], [ex, midY], [nx, midY], [nx, ty], [tx, ty]];
}

/** Turn a polyline into an SVG path with rounded corners. */
function roundedPath(points: readonly Point[], r: number): string {
  const pts = points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1],
  );
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const rad = Math.min(r, inLen / 2, outLen / 2);
    if (rad <= 0.5) {
      d += ` L ${cx} ${cy}`;
      continue;
    }
    const ax = cx - ((cx - px) / inLen) * rad;
    const ay = cy - ((cy - py) / inLen) * rad;
    const bx = cx + ((nx - cx) / outLen) * rad;
    const by = cy + ((ny - cy) / outLen) * rad;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

export type ArrowGeometry = {
  /** The elbow path itself. */
  path: string;
  /** Filled triangle at the successor end. */
  head: string;
  /** Midpoint of the route — where the edit affordance sits. */
  labelX: number;
  labelY: number;
};

/** Everything needed to draw one dependency arrow. */
export function buildArrow(
  from: ItemAnchors,
  fromSide: "start" | "end",
  to: ItemAnchors,
  toSide: "start" | "end",
): ArrowGeometry {
  const sx = fromSide === "end" ? from.endX : from.startX;
  const tx = toSide === "start" ? to.startX : to.endX;
  const points = routePoints(sx, from.midY, tx, to.midY, fromSide, toSide);
  // The head points the way the line arrives: rightwards into a start tip,
  // leftwards into a finish tip.
  const dir = toSide === "start" ? 1 : -1;
  const h = 4;
  const head = [
    `M ${tx} ${to.midY}`,
    `L ${tx - dir * 7} ${to.midY - h}`,
    `L ${tx - dir * 7} ${to.midY + h}`,
    "Z",
  ].join(" ");
  const mid = points[Math.floor(points.length / 2)];
  return {
    path: roundedPath(points, ELBOW_R),
    head,
    labelX: mid[0],
    labelY: mid[1],
  };
}

/** The dangling line drawn while a link is being dragged out of a tip. */
export function buildDraftArrow(
  from: ItemAnchors,
  fromSide: "start" | "end",
  x: number,
  y: number,
): string {
  const sx = fromSide === "end" ? from.endX : from.startX;
  return roundedPath(routePoints(sx, from.midY, x, y, fromSide, "start"), ELBOW_R);
}
