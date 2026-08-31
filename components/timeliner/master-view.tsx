"use client";

import * as React from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isSameDay,
  isWeekend,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown, ChevronRight, Flag, Star } from "lucide-react";

import {
  TODAY_BODY,
  TODAY_HEADER,
  TODAY_TEXT,
  WEEKEND_BODY,
  buildHolidayMap,
  buildMonthSegments,
  firstHolidayColor,
  ownerColors,
} from "@/lib/timeliner/grid";
import {
  type Holiday,
  type Timeline,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/**
 * MASTER: every timeline's important work on one horizon.
 *
 * Where a timeline answers "how does this project run", MASTER answers "what
 * is coming, everywhere". So it drops the day-by-day detail: each project is
 * one collapsed lane carrying only its key items — every milestone, plus the
 * tasks someone starred — from today forward. Open a lane to read the titles,
 * click its name to jump into the timeline itself.
 */

const LANE_H = 34;
const ITEM_H = 26;
const NAME_W = 224;
const HEADER_H = 26;

/** Day width per horizon, so two or three months still land on one screen. */
const HORIZONS = [
  { months: 1, label: "1 mes", dayW: 18 },
  { months: 2, label: "2 meses", dayW: 11 },
  { months: 3, label: "3 meses", dayW: 8 },
] as const;

/** Milestones matter by definition; tasks have to be starred. */
function isKeyItem(item: TimelineItem): boolean {
  return item.kind === "milestone" || item.is_key;
}

export function MasterView({
  timelines,
  items,
  holidays,
  onOpenTimeline,
}: {
  timelines: Timeline[];
  items: TimelineItem[];
  holidays: Holiday[];
  onOpenTimeline: (id: string) => void;
}) {
  const [horizonIdx, setHorizonIdx] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const horizon = HORIZONS[horizonIdx];

  // The window: this week through `months` out, padded to whole weeks so the
  // columns line up with the weekday header. Built in one pass so every date
  // downstream — the ruler, the clamps, the "from today" filter — agrees.
  const { today, rangeStart, days, todayISO, rangeEndISO } = React.useMemo(() => {
    const now = startOfDay(new Date());
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(addMonths(now, horizon.months), { weekStartsOn: 1 });
    const count = differenceInCalendarDays(end, start) + 1;
    const list = Array.from({ length: count }, (_, i) => addDays(start, i));
    return {
      today: now,
      rangeStart: start,
      days: list,
      todayISO: format(now, "yyyy-MM-dd"),
      rangeEndISO: format(list[list.length - 1], "yyyy-MM-dd"),
    };
  }, [horizon.months]);

  const gridWidth = days.length * horizon.dayW;

  /** Key items still open (or still to come) inside the window, per timeline. */
  const lanes = React.useMemo(() => {
    const byTimeline = new Map<string, TimelineItem[]>();
    for (const it of items) {
      if (!isKeyItem(it)) continue;
      // "Hacia adelante": anything already finished is history.
      if (it.end_date < todayISO) continue;
      if (it.start_date > rangeEndISO) continue;
      const list = byTimeline.get(it.timeline_id);
      if (list) list.push(it);
      else byTimeline.set(it.timeline_id, [it]);
    }
    return timelines.map((t) => ({
      timeline: t,
      items: (byTimeline.get(t.id) ?? []).sort((a, b) =>
        a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
      ),
    }));
  }, [items, timelines, todayISO, rangeEndISO]);

  const holidayByDate = React.useMemo(() => {
    const countries = [...new Set(timelines.flatMap((t) => t.holiday_countries))];
    return buildHolidayMap(holidays, countries);
  }, [holidays, timelines]);

  const monthSegments = React.useMemo(
    () => buildMonthSegments(days, horizon.dayW),
    [days, horizon.dayW],
  );

  const withItems = lanes.filter((l) => l.items.length > 0);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Grid geometry for one item, clamped to the visible window. */
  function geometry(item: TimelineItem) {
    const startIdx = Math.max(
      0,
      differenceInCalendarDays(parseISO(item.start_date), rangeStart),
    );
    const endIdx = Math.min(
      days.length - 1,
      differenceInCalendarDays(parseISO(item.end_date), rangeStart),
    );
    return {
      left: startIdx * horizon.dayW,
      width: Math.max(horizon.dayW, (endIdx - startIdx + 1) * horizon.dayW),
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Todo lo importante de todos los timelines, de hoy en adelante: los
          hitos y las tareas marcadas con{" "}
          <Star className="inline size-3 -translate-y-px fill-amber-500 text-amber-500" />
          . Cada proyecto es una fila; abrila para ver los títulos.
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Horizonte
          </span>
          {HORIZONS.map((h, i) => (
            <button
              key={h.months}
              type="button"
              onClick={() => setHorizonIdx(i)}
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                i === horizonIdx
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
              aria-pressed={i === horizonIdx}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="bg-card overflow-auto rounded-xl border"
        style={{ maxHeight: "72vh" }}
      >
        <div style={{ width: NAME_W + gridWidth, minWidth: "100%" }}>
          {/* Header: months over a week ruler */}
          <div className="bg-card sticky top-0 z-30">
            <div className="flex border-b">
              <div
                className="bg-card text-muted-foreground sticky left-0 z-40 shrink-0 border-r px-3 py-1.5 text-xs font-semibold"
                style={{ width: NAME_W }}
              >
                Proyecto
              </div>
              <div className="relative" style={{ width: gridWidth, height: 28 }}>
                {monthSegments.map((seg) => (
                  <div
                    key={seg.left}
                    className="text-muted-foreground absolute top-0 truncate border-r py-1.5 pl-2 text-[11px] font-semibold"
                    style={{ left: seg.left, width: seg.width, height: 28 }}
                  >
                    {seg.label}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex border-b">
              <div
                className="bg-card sticky left-0 z-40 shrink-0 border-r"
                style={{ width: NAME_W }}
              />
              <div className="flex" style={{ width: gridWidth, height: HEADER_H }}>
                {days.map((d) => {
                  const iso = format(d, "yyyy-MM-dd");
                  const isMonday = d.getDay() === 1;
                  const isToday = isSameDay(d, today);
                  const hc = firstHolidayColor(
                    holidayByDate.get(iso)?.countries ?? [],
                  );
                  return (
                    <div
                      key={iso}
                      className={cn(
                        "flex shrink-0 items-center justify-center text-[9px] leading-none",
                        isMonday && "border-l",
                        hc?.header,
                        isToday && TODAY_HEADER,
                      )}
                      style={{ width: horizon.dayW }}
                    >
                      {/* Only Mondays get a number — a daily ruler is unreadable
                          at this scale and nobody plans a quarter by the day. */}
                      {isMonday ? (
                        <span
                          className={cn(
                            "tabular-nums",
                            isToday ? TODAY_TEXT : "text-muted-foreground",
                          )}
                        >
                          {d.getDate()}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Lanes */}
          {withItems.length === 0 ? (
            <div className="text-muted-foreground px-4 py-12 text-center text-sm">
              No hay hitos ni tareas destacadas en los próximos{" "}
              {horizon.label.toLowerCase()}.
              <span className="mt-1 block text-xs">
                Marcá tareas con la estrella dentro de un timeline para que
                aparezcan acá.
              </span>
            </div>
          ) : (
            withItems.map(({ timeline, items: laneItems }) => {
              const open = expanded.has(timeline.id);
              const milestones = laneItems.filter((i) => i.kind === "milestone");
              // Sorted by start, so the head of the lane is what lands next.
              const next = laneItems[0];
              return (
                <div key={timeline.id} className="border-b last:border-b-0">
                  {/* Collapsed lane: every key item on one row */}
                  <div className="flex" style={{ height: LANE_H }}>
                    <div
                      className="bg-card sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r pr-2 pl-1"
                      style={{ width: NAME_W }}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(timeline.id)}
                        aria-expanded={open}
                        aria-label={open ? "Colapsar" : "Expandir"}
                        className="text-muted-foreground hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded"
                      >
                        {open ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenTimeline(timeline.id)}
                        className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors"
                        title={`Abrir ${timeline.name}`}
                      >
                        {timeline.name}
                      </button>
                      <span
                        className="text-muted-foreground shrink-0 text-[11px] tabular-nums"
                        title={`${laneItems.length} ítems clave · ${milestones.length} hitos · próximo: ${next.title}`}
                      >
                        {format(parseISO(next.start_date), "d MMM", { locale: es })}
                        <Flag className="ml-1.5 inline size-2.5 -translate-y-px" />
                        {milestones.length}
                      </span>
                    </div>
                    <div className="relative" style={{ width: gridWidth }}>
                      <DayBackground
                        days={days}
                        dayW={horizon.dayW}
                        today={today}
                        holidayByDate={holidayByDate}
                      />
                      {laneItems.map((item) => {
                        const g = geometry(item);
                        const colors = ownerColors(item.owner_key);
                        const label = `${item.title} · ${format(parseISO(item.start_date), "d MMM", { locale: es })}`;
                        if (item.kind === "milestone") {
                          return (
                            <span
                              key={item.id}
                              title={label}
                              className={cn(
                                "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] border border-white/70 dark:border-black/30",
                                colors.barBg,
                              )}
                              style={{ left: g.left + horizon.dayW / 2 }}
                            />
                          );
                        }
                        return (
                          <span
                            key={item.id}
                            title={label}
                            className={cn(
                              "absolute top-1/2 h-2 -translate-y-1/2 rounded-full",
                              colors.barBg,
                            )}
                            style={{ left: g.left, width: g.width }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Expanded: one titled row per key item */}
                  {open
                    ? laneItems.map((item) => {
                        const g = geometry(item);
                        const colors = ownerColors(item.owner_key);
                        const isMilestone = item.kind === "milestone";
                        return (
                          <div
                            key={item.id}
                            className="bg-muted/20 flex border-t"
                            style={{ height: ITEM_H }}
                          >
                            <div
                              className="bg-card sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r pr-2 pl-8"
                              style={{ width: NAME_W }}
                            >
                              {isMilestone ? (
                                <span
                                  className={cn(
                                    "size-2 shrink-0 rotate-45 rounded-[1px]",
                                    colors.barBg,
                                  )}
                                />
                              ) : (
                                <Star className="size-2.5 shrink-0 fill-amber-500 text-amber-500" />
                              )}
                              <span className="truncate text-[11px]">
                                {item.title}
                              </span>
                            </div>
                            <div className="relative" style={{ width: gridWidth }}>
                              <DayBackground
                                days={days}
                                dayW={horizon.dayW}
                                today={today}
                                holidayByDate={holidayByDate}
                              />
                              {isMilestone ? (
                                <span
                                  className={cn(
                                    "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]",
                                    colors.barBg,
                                  )}
                                  style={{ left: g.left + horizon.dayW / 2 }}
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "absolute top-1/2 h-2 -translate-y-1/2 rounded-full",
                                    colors.barBg,
                                  )}
                                  style={{ left: g.left, width: g.width }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {withItems.length > 0 ? (
        <p className="text-muted-foreground text-[11px]">
          {withItems.length} proyecto{withItems.length === 1 ? "" : "s"} con
          trabajo por delante en este horizonte.
        </p>
      ) : null}
    </div>
  );
}

/** Weekend / holiday / today tint behind a lane. */
function DayBackground({
  days,
  dayW,
  today,
  holidayByDate,
}: {
  days: Date[];
  dayW: number;
  today: Date;
  holidayByDate: Map<string, { countries: string[]; names: string[] }>;
}) {
  return (
    <div className="absolute inset-0 flex">
      {days.map((d) => {
        const iso = format(d, "yyyy-MM-dd");
        const hc = firstHolidayColor(holidayByDate.get(iso)?.countries ?? []);
        return (
          <div
            key={iso}
            className={cn(
              "shrink-0",
              d.getDay() === 1 && "border-l",
              isWeekend(d) && WEEKEND_BODY,
              hc?.body,
              isSameDay(d, today) && TODAY_BODY,
            )}
            style={{ width: dayW }}
          />
        );
      })}
    </div>
  );
}
