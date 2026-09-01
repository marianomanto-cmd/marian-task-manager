"use client";

import * as React from "react";
import {
  addMonths,
  differenceInCalendarDays,
  format,
  isSameMonth,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { CalendarRange, Flag, List } from "lucide-react";

import { buildDayRange, buildMonthSegments, ownerColors } from "@/lib/timeliner/grid";
import {
  TIMELINE_OWNERS,
  ownerInfo,
  type MasterTimeline,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/**
 * MASTER: the milestones of every timeline on one horizon.
 *
 * A timeline answers "how does this project run"; MASTER answers "what lands,
 * and when, across all of them". So it carries nothing but hitos — no tasks,
 * no durations, no groups.
 *
 * Legibility is the whole job here, and milestones cluster: three of them in
 * the same week is normal, and a row of unlabelled diamonds tells you nothing.
 * So a project's lane grows instead of hiding titles — hitos are packed into
 * as many sub-rows as it takes for every label to fit. Weekends and holidays
 * are deliberately absent: at this zoom they are stripes, not information.
 * Alternating month bands carry the horizontal orientation instead.
 */

const SUB_ROW_H = 22;
const LANE_PAD = 7;
const NAME_W = 208;

/** Column width per zoom. Wider = more detail, narrower = more horizon. */
const ZOOMS = [
  { key: "detalle", label: "Detalle", dayW: 20 },
  { key: "normal", label: "Normal", dayW: 10 },
  { key: "panorama", label: "Panorama", dayW: 5 },
] as const;

// Label width estimate, so hitos can be packed without measuring the DOM.
const CHAR_W = 6.1;
const TITLE_MAX_PX = 190;
const DIAMOND_W = 16;
const DATE_W = 52;
const LABEL_GAP = 14;
/**
 * Below this column width the labels stop earning their space: they would
 * stack a lane ten rows deep just to zoom *out*. Panorama drops to bare
 * diamonds — a density map of "who is busy when" — and the list view is there
 * for reading the names.
 */
const LABEL_MIN_DAY_W = 10;

function labelWidth(title: string): number {
  return (
    DIAMOND_W +
    Math.min(title.length * CHAR_W, TITLE_MAX_PX) +
    DATE_W +
    LABEL_GAP
  );
}

type Placed = {
  item: TimelineItem;
  left: number;
  /** Sub-row inside the lane; 0 is the top one. */
  row: number;
};

type Lane = {
  timeline: MasterTimeline;
  milestones: TimelineItem[];
  placed: Placed[];
  rows: number;
};

export function MasterView({
  timelines,
  items,
  onOpenTimeline,
}: {
  timelines: MasterTimeline[];
  items: TimelineItem[];
  /** Omitted on the public link, where there is no timeline to open. */
  onOpenTimeline?: (id: string) => void;
}) {
  const [view, setView] = React.useState<"chart" | "list">("chart");
  const [zoomIdx, setZoomIdx] = React.useState(1);
  const dayW = ZOOMS[zoomIdx].dayW;
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const today = startOfDay(new Date());

  // Milestones only, per timeline, in date order.
  const byTimeline = React.useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const it of items) {
      if (it.kind !== "milestone") continue;
      const bucket = m.get(it.timeline_id);
      if (bucket) bucket.push(it);
      else m.set(it.timeline_id, [it]);
    }
    for (const list of m.values()) {
      list.sort((a, b) =>
        a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
      );
    }
    return m;
  }, [items]);

  const orderedTimelines = React.useMemo(
    () => [...timelines].sort((a, b) => a.position - b.position),
    [timelines],
  );

  const allMilestones = React.useMemo(
    () => orderedTimelines.flatMap((t) => byTimeline.get(t.id) ?? []),
    [orderedTimelines, byTimeline],
  );

  // The window spans every hito there is, so nothing falls off the edge. With
  // no hitos at all, show the next two months rather than an empty sliver.
  const { rangeStart, days } = React.useMemo(() => {
    const range = buildDayRange(allMilestones, today);
    if (allMilestones.length > 0) return range;
    const last = range.days[range.days.length - 1];
    const extra = differenceInCalendarDays(addMonths(today, 2), last);
    for (let i = 1; i <= extra; i++) {
      const d = new Date(last);
      d.setDate(d.getDate() + i);
      range.days.push(d);
    }
    return range;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMilestones]);

  /**
   * Pack each lane's hitos into sub-rows: first-fit, walking them in date
   * order, so a label only drops to the next row when it would collide with
   * the one before it. Every title stays readable, and a quiet project still
   * takes a single row.
   */
  const withLabels = dayW >= LABEL_MIN_DAY_W;

  const lanes: Lane[] = React.useMemo(
    () =>
      orderedTimelines.map((timeline) => {
        const milestones = byTimeline.get(timeline.id) ?? [];
        const rowRight: number[] = [];
        const placed: Placed[] = milestones.map((item) => {
          const left =
            differenceInCalendarDays(parseISO(item.start_date), rangeStart) *
              dayW +
            dayW / 2;
          if (!withLabels) return { item, left, row: 0 };
          const width = labelWidth(item.title);
          let row = rowRight.findIndex((right) => left >= right);
          if (row === -1) {
            rowRight.push(left + width);
            row = rowRight.length - 1;
          } else {
            rowRight[row] = left + width;
          }
          return { item, left, row };
        });
        return {
          timeline,
          milestones,
          placed,
          rows: Math.max(1, rowRight.length),
        };
      }),
    [orderedTimelines, byTimeline, rangeStart, dayW, withLabels],
  );

  const gridWidth = days.length * dayW;
  const monthSegments = React.useMemo(
    () => buildMonthSegments(days, dayW),
    [days, dayW],
  );

  const todayOffset = React.useMemo(() => {
    const idx = differenceInCalendarDays(today, rangeStart);
    if (idx < 0 || idx >= days.length) return null;
    return idx * dayW + dayW / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, days.length, dayW]);

  // Open near today instead of at whatever month the earliest hito sits in.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || todayOffset === null || view !== "chart") return;
    el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 3);
  }, [todayOffset, view]);

  const total = allMilestones.length;

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Chip active={view === "chart"} onClick={() => setView("chart")}>
              <CalendarRange className="size-3" />
              Calendario
            </Chip>
            <Chip active={view === "list"} onClick={() => setView("list")}>
              <List className="size-3" />
              Lista
            </Chip>
          </div>
          {view === "chart" ? (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                Zoom
              </span>
              {ZOOMS.map((z, i) => (
                <Chip
                  key={z.key}
                  active={i === zoomIdx}
                  onClick={() => setZoomIdx(i)}
                >
                  {z.label}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {view === "list" ? (
        <MasterList
          timelines={orderedTimelines}
          milestones={allMilestones}
          today={today}
          onOpenTimeline={onOpenTimeline}
        />
      ) : (
        <div
          ref={scrollerRef}
          className="bg-card overflow-auto rounded-xl border"
          style={{ maxHeight: "72vh" }}
        >
          <div style={{ width: NAME_W + gridWidth, minWidth: "100%" }}>
            {/* Month ruler */}
            <div className="bg-card sticky top-0 z-20 flex border-b">
              <div
                className="bg-card text-muted-foreground sticky left-0 z-30 shrink-0 border-r px-3 py-1.5 text-xs font-semibold"
                style={{ width: NAME_W }}
              >
                Proyecto
              </div>
              <div className="relative" style={{ width: gridWidth, height: 28 }}>
                {monthSegments.map((seg, i) => (
                  <div
                    key={seg.left}
                    className={cn(
                      "text-muted-foreground absolute top-0 truncate py-1.5 pl-2 text-[11px] font-semibold",
                      i > 0 && "border-l",
                    )}
                    style={{ left: seg.left, width: seg.width, height: 28 }}
                  >
                    {seg.width >= 52 ? seg.label : ""}
                  </div>
                ))}
              </div>
            </div>

            {lanes.length === 0 ? (
              <div className="text-muted-foreground flex items-center px-3 py-10 text-sm">
                Todavía no hay timelines.
              </div>
            ) : (
              lanes.map((lane, laneIdx) => (
                <div
                  key={lane.timeline.id}
                  className={cn(
                    "relative flex border-b last:border-b-0",
                    laneIdx % 2 === 1 && "bg-muted/20",
                  )}
                  style={{ height: lane.rows * SUB_ROW_H + LANE_PAD * 2 }}
                >
                  <div
                    className={cn(
                      "sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3",
                      laneIdx % 2 === 1 ? "bg-muted/40" : "bg-card",
                    )}
                    style={{ width: NAME_W }}
                  >
                    {onOpenTimeline ? (
                      <button
                        type="button"
                        onClick={() => onOpenTimeline(lane.timeline.id)}
                        className="hover:text-primary min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors"
                        title={`Abrir ${lane.timeline.name}`}
                      >
                        {lane.timeline.name}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {lane.timeline.name}
                      </span>
                    )}
                    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums">
                      <Flag className="size-3" />
                      {lane.milestones.length}
                    </span>
                  </div>

                  <div className="relative" style={{ width: gridWidth }}>
                    {/* Alternating month bands: the horizontal orientation. */}
                    {monthSegments.map((seg, i) => (
                      <div
                        key={seg.left}
                        aria-hidden
                        className={cn(
                          "absolute inset-y-0",
                          i % 2 === 1 && "bg-foreground/[0.035]",
                          i > 0 && "border-l",
                        )}
                        style={{ left: seg.left, width: seg.width }}
                      />
                    ))}

                    {todayOffset !== null ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 z-[5] w-px bg-sky-500/70"
                        style={{ left: todayOffset }}
                      />
                    ) : null}

                    {lane.milestones.length === 0 ? (
                      <span className="text-muted-foreground/60 absolute top-1/2 left-3 -translate-y-1/2 text-[11px] italic">
                        Sin hitos
                      </span>
                    ) : null}

                    {lane.placed.map(({ item, left, row }) => (
                      <MilestoneChip
                        key={item.id}
                        item={item}
                        left={left}
                        top={LANE_PAD + row * SUB_ROW_H}
                        withLabel={withLabels}
                        onOpen={
                          onOpenTimeline
                            ? () => onOpenTimeline(item.timeline_id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {total === 0
          ? "Ningún timeline tiene hitos cargados todavía. Agregá uno con el botón “Hito” dentro de su timeline."
          : `${total} ${total === 1 ? "hito" : "hitos"} en ${lanes.length} ${lanes.length === 1 ? "timeline" : "timelines"}. Sólo se muestran hitos — las tareas viven en cada timeline. Tocá un proyecto o un hito para abrirlo.`}
      </p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** One hito on the calendar: diamond, title, and the date it lands on. */
function MilestoneChip({
  item,
  left,
  top,
  withLabel,
  onOpen,
}: {
  item: TimelineItem;
  left: number;
  top: number;
  withLabel: boolean;
  onOpen?: () => void;
}) {
  const colors = ownerColors(item.owner_key);
  const ownerLabel = ownerInfo(item.owner_key)?.label ?? "Sin owner";
  const date = parseISO(item.start_date);
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      title={`${item.title} · ${format(date, "d MMM yyyy", { locale: es })} · ${ownerLabel}`}
      className={cn(
        "absolute z-10 flex items-center gap-1.5 rounded pr-1.5 text-left transition-colors",
        onOpen && "hover:bg-background/80",
      )}
      style={{ left, top, height: SUB_ROW_H }}
    >
      <span
        className={cn(
          "size-2.5 shrink-0 -translate-x-1/2 rotate-45 rounded-[2px] border border-white/70 shadow-sm dark:border-black/30",
          colors.barBg,
        )}
      />
      {withLabel ? (
        <>
          <span
            className="text-foreground/90 -ml-1 truncate text-[11px] font-medium"
            style={{ maxWidth: TITLE_MAX_PX }}
          >
            {item.title}
          </span>
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {format(date, "d MMM", { locale: es })}
          </span>
        </>
      ) : null}
    </Tag>
  );
}

/**
 * The same hitos as a chronological list: one line each, grouped by month,
 * with a marker where today falls. Nothing overlaps and nothing is truncated
 * by geometry — the fastest way to read "what is coming".
 */
function MasterList({
  timelines,
  milestones,
  today,
  onOpenTimeline,
}: {
  timelines: MasterTimeline[];
  milestones: TimelineItem[];
  today: Date;
  onOpenTimeline?: (id: string) => void;
}) {
  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of timelines) m.set(t.id, t.name);
    return m;
  }, [timelines]);

  const months = React.useMemo(() => {
    const sorted = [...milestones].sort((a, b) =>
      a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0,
    );
    const out: { key: string; label: string; items: TimelineItem[] }[] = [];
    for (const item of sorted) {
      const d = parseISO(item.start_date);
      const key = format(d, "yyyy-MM");
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(item);
      else {
        const label = format(d, "MMMM yyyy", { locale: es });
        out.push({
          key,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          items: [item],
        });
      }
    }
    return out;
  }, [milestones]);

  if (months.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-xl border px-3 py-10 text-center text-sm">
        Todavía no hay hitos cargados.
      </div>
    );
  }

  const todayISO = format(today, "yyyy-MM-dd");
  const RowTag = onOpenTimeline ? "button" : "div";

  return (
    <div className="bg-card overflow-auto rounded-xl border" style={{ maxHeight: "72vh" }}>
      {months.map((month) => (
        <div key={month.key}>
          <div className="bg-muted text-muted-foreground sticky top-0 z-10 border-b px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
            {month.label}
            {isSameMonth(parseISO(`${month.key}-01`), today) ? (
              <span className="text-sky-600 dark:text-sky-300"> · este mes</span>
            ) : null}
          </div>
          {month.items.map((item) => {
            const colors = ownerColors(item.owner_key);
            const d = parseISO(item.start_date);
            const past = item.start_date < todayISO;
            return (
              <RowTag
                key={item.id}
                {...(onOpenTimeline
                  ? {
                      type: "button" as const,
                      onClick: () => onOpenTimeline(item.timeline_id),
                    }
                  : {})}
                className={cn(
                  "flex w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors last:border-b-0",
                  onOpenTimeline && "hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "w-20 shrink-0 text-xs tabular-nums",
                    past ? "text-muted-foreground/60" : "text-foreground",
                  )}
                >
                  {format(d, "EEE d MMM", { locale: es })}
                </span>
                <span
                  className={cn(
                    "size-2.5 shrink-0 rotate-45 rounded-[2px]",
                    colors.barBg,
                    past && "opacity-50",
                  )}
                />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium",
                    past && "text-muted-foreground",
                  )}
                >
                  {item.title}
                </span>
                <span className="text-muted-foreground hidden shrink-0 truncate text-xs sm:block sm:max-w-[14rem]">
                  {nameById.get(item.timeline_id) ?? ""}
                </span>
              </RowTag>
            );
          })}
        </div>
      ))}
    </div>
  );
}
