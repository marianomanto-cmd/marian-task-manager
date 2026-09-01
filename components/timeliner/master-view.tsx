"use client";

import * as React from "react";
import {
  addMonths,
  differenceInCalendarDays,
  format,
  isSameDay,
  isWeekend,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { Flag } from "lucide-react";

import {
  TODAY_BODY,
  TODAY_HEADER,
  TODAY_TEXT,
  WEEKEND_BODY,
  WEEKEND_HEADER,
  buildDayRange,
  buildHolidayMap,
  buildMonthSegments,
  firstHolidayColor,
  ownerColors,
} from "@/lib/timeliner/grid";
import {
  TIMELINE_OWNERS,
  ownerInfo,
  type Holiday,
  type Timeline,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/**
 * MASTER: the milestones of every timeline on one horizon.
 *
 * A timeline answers "how does this project run"; MASTER answers "what lands,
 * and when, across all of them". So it carries nothing but hitos — no tasks,
 * no durations, no groups — one lane per project, on a single shared calendar.
 * Read-only by design: click a project (or one of its hitos) to open the
 * timeline that owns it.
 */

const LANE_H = 44;
const NAME_W = 224;

/** Column width per zoom. Wider = more detail, narrower = more horizon. */
const ZOOMS = [
  { key: "detalle", label: "Detalle", dayW: 26 },
  { key: "normal", label: "Normal", dayW: 12 },
  { key: "panorama", label: "Panorama", dayW: 5 },
] as const;

/** Day numbers need room; below this the header shows months only. */
const DAY_NUMBER_MIN_W = 18;
/** Below this, per-day tints turn into noise instead of information. */
const DAY_TINT_MIN_W = 10;
/** A title only renders if it has at least this much clear space beside it. */
const LABEL_MIN_PX = 84;

type Lane = {
  timeline: Timeline;
  milestones: TimelineItem[];
};

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
  const [zoomIdx, setZoomIdx] = React.useState(1);
  const dayW = ZOOMS[zoomIdx].dayW;
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const today = startOfDay(new Date());

  // One lane per timeline, in the order the tabs show them. A project with no
  // hitos still gets its lane — "nothing scheduled" is worth seeing.
  const lanes: Lane[] = React.useMemo(() => {
    const byTimeline = new Map<string, TimelineItem[]>();
    for (const it of items) {
      if (it.kind !== "milestone") continue;
      const bucket = byTimeline.get(it.timeline_id);
      if (bucket) bucket.push(it);
      else byTimeline.set(it.timeline_id, [it]);
    }
    for (const list of byTimeline.values()) {
      list.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
    }
    return [...timelines]
      .sort((a, b) => a.position - b.position)
      .map((timeline) => ({
        timeline,
        milestones: byTimeline.get(timeline.id) ?? [],
      }));
  }, [timelines, items]);

  const allMilestones = React.useMemo(
    () => lanes.flatMap((l) => l.milestones),
    [lanes],
  );

  // The window spans every hito there is, so nothing falls off the edge. With
  // no hitos at all, show the next two months rather than an empty sliver.
  const { rangeStart, days } = React.useMemo(() => {
    if (allMilestones.length === 0) {
      const filler: TimelineItem[] = [];
      const range = buildDayRange(filler, today);
      const end = addMonths(today, 2);
      const extra = differenceInCalendarDays(end, range.days[range.days.length - 1]);
      if (extra > 0) {
        const last = range.days[range.days.length - 1];
        for (let i = 1; i <= extra; i++) {
          const d = new Date(last);
          d.setDate(d.getDate() + i);
          range.days.push(d);
        }
      }
      return range;
    }
    return buildDayRange(allMilestones, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMilestones]);

  const gridWidth = days.length * dayW;

  // Every country any timeline highlights: MASTER spans them all, so it can't
  // defer to a single timeline's setting.
  const holidayCountries = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of timelines) for (const c of t.holiday_countries) set.add(c);
    return [...set];
  }, [timelines]);

  const weekendsOn = React.useMemo(
    () => timelines.some((t) => t.weekends_enabled),
    [timelines],
  );

  const holidayByDate = React.useMemo(
    () => buildHolidayMap(holidays, holidayCountries),
    [holidays, holidayCountries],
  );

  const monthSegments = React.useMemo(
    () => buildMonthSegments(days, dayW),
    [days, dayW],
  );

  const showDayNumbers = dayW >= DAY_NUMBER_MIN_W;
  const showDayTint = dayW >= DAY_TINT_MIN_W;

  const todayOffset = React.useMemo(() => {
    const idx = differenceInCalendarDays(today, rangeStart);
    if (idx < 0 || idx >= days.length) return null;
    return idx * dayW + dayW / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, days.length, dayW]);

  // Open near today instead of at whatever month the earliest hito sits in.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || todayOffset === null) return;
    el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 3);
  }, [todayOffset]);

  const totalMilestones = allMilestones.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
          {TIMELINE_OWNERS.map((o) => (
            <span key={o.code} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rotate-45 rounded-[2px]", o.dot)} />
              {o.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
            Zoom
          </span>
          {ZOOMS.map((z, i) => (
            <button
              key={z.key}
              type="button"
              onClick={() => setZoomIdx(i)}
              className={cn(
                "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors",
                i === zoomIdx
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
              aria-pressed={i === zoomIdx}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="bg-card overflow-auto rounded-xl border"
        style={{ maxHeight: "72vh" }}
      >
        <div style={{ width: NAME_W + gridWidth, minWidth: "100%" }}>
          {/* Header */}
          <div className="bg-card sticky top-0 z-20">
            <div className="flex border-b">
              <div
                className="bg-card text-muted-foreground sticky left-0 z-30 shrink-0 border-r px-3 py-1.5 text-xs font-semibold"
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
                    {seg.width >= 44 ? seg.label : ""}
                  </div>
                ))}
              </div>
            </div>
            {showDayNumbers ? (
              <div className="flex border-b">
                <div
                  className="bg-card sticky left-0 z-30 shrink-0 border-r"
                  style={{ width: NAME_W }}
                />
                <div className="flex" style={{ width: gridWidth }}>
                  {days.map((d) => {
                    const iso = format(d, "yyyy-MM-dd");
                    const weekend = weekendsOn && isWeekend(d);
                    const entry = holidayByDate.get(iso);
                    const hc = entry ? firstHolidayColor(entry.countries) : null;
                    const isToday = isSameDay(d, today);
                    return (
                      <div
                        key={iso}
                        title={entry ? entry.names.join("\n") : undefined}
                        className={cn(
                          "flex shrink-0 items-center justify-center border-r py-1 text-[10px] leading-tight",
                          weekend && WEEKEND_HEADER,
                          hc && hc.header,
                          isToday && TODAY_HEADER,
                        )}
                        style={{ width: dayW }}
                      >
                        <span
                          className={cn(
                            "tabular-nums",
                            hc && hc.text,
                            isToday && TODAY_TEXT,
                          )}
                        >
                          {d.getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Lanes */}
          {lanes.length === 0 ? (
            <div className="text-muted-foreground flex items-center px-3 py-10 text-sm">
              Todavía no hay timelines.
            </div>
          ) : (
            lanes.map((lane) => (
              <MasterLane
                key={lane.timeline.id}
                lane={lane}
                days={days}
                dayW={dayW}
                gridWidth={gridWidth}
                rangeStart={rangeStart}
                today={today}
                weekendsOn={weekendsOn}
                showDayTint={showDayTint}
                todayOffset={todayOffset}
                holidayByDate={holidayByDate}
                onOpenTimeline={onOpenTimeline}
              />
            ))
          )}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {totalMilestones === 0
          ? "Ningún timeline tiene hitos cargados todavía. Agregá uno con el botón “Hito” dentro de su timeline."
          : `${totalMilestones} ${totalMilestones === 1 ? "hito" : "hitos"} en ${lanes.length} ${lanes.length === 1 ? "timeline" : "timelines"}. Sólo se muestran hitos — las tareas viven en cada timeline. Tocá un proyecto o un hito para abrirlo.`}
      </p>
    </div>
  );
}

function MasterLane({
  lane,
  days,
  dayW,
  gridWidth,
  rangeStart,
  today,
  weekendsOn,
  showDayTint,
  todayOffset,
  holidayByDate,
  onOpenTimeline,
}: {
  lane: Lane;
  days: Date[];
  dayW: number;
  gridWidth: number;
  rangeStart: Date;
  today: Date;
  weekendsOn: boolean;
  showDayTint: boolean;
  todayOffset: number | null;
  holidayByDate: Map<string, { countries: string[]; names: string[] }>;
  onOpenTimeline: (id: string) => void;
}) {
  const { timeline, milestones } = lane;

  // Place each hito, and decide whether its title fits: a label is drawn only
  // when the next hito in the lane is far enough away to not collide with it.
  const placed = React.useMemo(() => {
    const indexes = milestones.map((m) =>
      differenceInCalendarDays(parseISO(m.start_date), rangeStart),
    );
    return milestones.map((item, i) => {
      const idx = indexes[i];
      const nextIdx = indexes[i + 1];
      const gapPx =
        nextIdx === undefined ? Number.POSITIVE_INFINITY : (nextIdx - idx) * dayW;
      return {
        item,
        left: idx * dayW + dayW / 2,
        showLabel: gapPx >= LABEL_MIN_PX,
        labelMax: Math.min(gapPx - 12, 220),
      };
    });
  }, [milestones, rangeStart, dayW]);

  return (
    <div className="relative flex border-b last:border-b-0" style={{ height: LANE_H }}>
      <div
        className="bg-card sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3"
        style={{ width: NAME_W }}
      >
        <button
          type="button"
          onClick={() => onOpenTimeline(timeline.id)}
          className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors"
          title={`Abrir ${timeline.name}`}
        >
          {timeline.name}
        </button>
        <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
          <Flag className="size-3" />
          {milestones.length}
        </span>
      </div>

      <div className="relative" style={{ width: gridWidth }}>
        {showDayTint ? (
          <div className="absolute inset-0 flex">
            {days.map((d) => {
              const iso = format(d, "yyyy-MM-dd");
              const weekend = weekendsOn && isWeekend(d);
              const entry = holidayByDate.get(iso);
              const hc = entry ? firstHolidayColor(entry.countries) : null;
              const isToday = isSameDay(d, today);
              return (
                <div
                  key={iso}
                  className={cn(
                    "shrink-0",
                    weekend && WEEKEND_BODY,
                    hc && hc.body,
                    isToday && TODAY_BODY,
                  )}
                  style={{ width: dayW }}
                />
              );
            })}
          </div>
        ) : null}

        {todayOffset !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-sky-500/60"
            style={{ left: todayOffset }}
          />
        ) : null}

        {milestones.length === 0 ? (
          <span className="text-muted-foreground/60 absolute top-1/2 left-3 -translate-y-1/2 text-[11px] italic">
            Sin hitos
          </span>
        ) : null}

        {placed.map(({ item, left, showLabel, labelMax }) => {
          const colors = ownerColors(item.owner_key);
          const ownerLabel = ownerInfo(item.owner_key)?.label ?? "Sin owner";
          const when = format(parseISO(item.start_date), "d MMM yyyy", { locale: es });
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenTimeline(item.timeline_id)}
              title={`${item.title} · ${when} · ${ownerLabel}`}
              className="absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1.5 rounded pr-1 text-left"
              style={{ left }}
            >
              <span
                className={cn(
                  "size-3 shrink-0 -translate-x-1/2 rotate-45 rounded-[2px] border border-white/70 shadow-sm dark:border-black/30",
                  colors.barBg,
                )}
              />
              {showLabel ? (
                <span
                  className="text-foreground/85 -ml-1 truncate text-[11px] font-medium"
                  style={{ maxWidth: labelMax }}
                >
                  {item.title}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
