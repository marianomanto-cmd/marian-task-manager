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
import { CalendarRange, Check, ChevronDown, Flag, Layers, List } from "lucide-react";

import { buildDayRange, buildMonthSegments, ownerColors } from "@/lib/timeliner/grid";
import {
  TIMELINE_OWNERS,
  ownerInfo,
  type MasterTimeline,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeliner/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * MASTER: every timeline on one horizon.
 *
 * A timeline answers "how does this project run"; MASTER answers "what is
 * happening, everywhere". It draws the same work — tasks as bars, hitos as
 * diamonds — with one lane per project instead of one row per item, and two
 * filters on top: what to show (todo / hitos / tareas) and which groups of
 * each project to keep.
 *
 * Legibility is the whole job here, and work clusters: a lane grows into as
 * many sub-rows as it takes for every title to fit, rather than hiding names.
 * Weekends and holidays are deliberately absent — at this zoom they are
 * stripes, not information; alternating month bands carry the orientation.
 */

const SUB_ROW_H = 24;
const BAR_H = 16;
const LANE_PAD = 7;
const NAME_W = 208;

/** Column width per zoom. Wider = more detail, narrower = more horizon. */
const ZOOMS = [
  { key: "detalle", label: "Detalle", dayW: 20 },
  { key: "normal", label: "Normal", dayW: 10 },
  { key: "panorama", label: "Panorama", dayW: 5 },
] as const;

// Label width estimate, so items can be packed without measuring the DOM.
const CHAR_W = 6.1;
const TITLE_MAX_PX = 190;
const DIAMOND_W = 16;
const DATE_W = 52;
const LABEL_GAP = 14;
/**
 * Below this column width labels stop earning their space: they would stack a
 * lane ten rows deep just to zoom *out*. Panorama keeps the bars and diamonds
 * — a density map of who is busy when — and the list view is there for names.
 */
const LABEL_MIN_DAY_W = 10;

type KindFilter = "all" | "milestone" | "task";

const KIND_FILTERS: readonly { key: KindFilter; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "milestone", label: "Sólo hitos" },
  { key: "task", label: "Sólo tareas" },
];

/** Key an item by the group it belongs to, per project. */
function groupKey(item: TimelineItem): string {
  return item.group_id ?? `sin:${item.timeline_id}`;
}
function ungroupedKey(timelineId: string): string {
  return `sin:${timelineId}`;
}

function titleWidth(title: string): number {
  return Math.min(title.length * CHAR_W, TITLE_MAX_PX);
}

type Placed = {
  item: TimelineItem;
  /** Left edge of the bar, or the day column for a hito. */
  left: number;
  /** Bar width; 0 for a hito. */
  width: number;
  /** True when a task's title fits inside its own bar. */
  labelInside: boolean;
  /** Sub-row inside the lane; 0 is the top one. */
  row: number;
};

type Lane = {
  timeline: MasterTimeline;
  items: TimelineItem[];
  placed: Placed[];
  rows: number;
};

export function MasterView({
  timelines,
  items,
  groups,
  onOpenTimeline,
}: {
  timelines: MasterTimeline[];
  items: TimelineItem[];
  groups: TimelineGroup[];
  /** Omitted on the public link, where there is no timeline to open. */
  onOpenTimeline?: (id: string) => void;
}) {
  const [view, setView] = React.useState<"chart" | "list">("chart");
  const [zoomIdx, setZoomIdx] = React.useState(1);
  const [kind, setKind] = React.useState<KindFilter>("all");
  const [selectedGroups, setSelectedGroups] = React.useState<string[]>([]);
  const dayW = ZOOMS[zoomIdx].dayW;
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const today = startOfDay(new Date());

  const orderedTimelines = React.useMemo(
    () => [...timelines].sort((a, b) => a.position - b.position),
    [timelines],
  );

  /**
   * Group selections are read per project: a project with nothing selected
   * shows everything. Narrowing "Creatividades" on one campaign shouldn't
   * empty out every other lane.
   */
  const selectedByTimeline = React.useMemo(() => {
    const groupTimeline = new Map(groups.map((g) => [g.id, g.timeline_id]));
    const m = new Map<string, Set<string>>();
    for (const key of selectedGroups) {
      const timelineId = key.startsWith("sin:")
        ? key.slice(4)
        : groupTimeline.get(key);
      if (!timelineId) continue;
      const bucket = m.get(timelineId);
      if (bucket) bucket.add(key);
      else m.set(timelineId, new Set([key]));
    }
    return m;
  }, [selectedGroups, groups]);

  const visible = React.useMemo(() => {
    return items.filter((it) => {
      if (kind !== "all" && it.kind !== kind) return false;
      const sel = selectedByTimeline.get(it.timeline_id);
      if (!sel || sel.size === 0) return true;
      return sel.has(groupKey(it));
    });
  }, [items, kind, selectedByTimeline]);

  const byTimeline = React.useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const it of visible) {
      const bucket = m.get(it.timeline_id);
      if (bucket) bucket.push(it);
      else m.set(it.timeline_id, [it]);
    }
    for (const list of m.values()) {
      list.sort((a, b) =>
        a.start_date !== b.start_date
          ? a.start_date < b.start_date
            ? -1
            : 1
          : a.end_date < b.end_date
            ? -1
            : a.end_date > b.end_date
              ? 1
              : 0,
      );
    }
    return m;
  }, [visible]);

  // The window spans everything shown, so nothing falls off the edge. With
  // nothing shown, offer the next two months rather than an empty sliver.
  const { rangeStart, days } = React.useMemo(() => {
    const range = buildDayRange(visible, today);
    if (visible.length > 0) return range;
    const last = range.days[range.days.length - 1];
    const extra = differenceInCalendarDays(addMonths(today, 2), last);
    for (let i = 1; i <= extra; i++) {
      const d = new Date(last);
      d.setDate(d.getDate() + i);
      range.days.push(d);
    }
    return range;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const withLabels = dayW >= LABEL_MIN_DAY_W;

  /**
   * Pack each lane into sub-rows: first-fit, walking items in date order, so
   * a bar or a label only drops to the next row when it would collide with
   * what is already there. A quiet project still takes a single row.
   */
  const lanes: Lane[] = React.useMemo(
    () =>
      orderedTimelines.map((timeline) => {
        const laneItems = byTimeline.get(timeline.id) ?? [];
        const rowRight: number[] = [];
        const placed: Placed[] = laneItems.map((item) => {
          const startIdx = differenceInCalendarDays(
            parseISO(item.start_date),
            rangeStart,
          );
          const isMilestone = item.kind === "milestone";
          const span =
            differenceInCalendarDays(
              parseISO(item.end_date),
              parseISO(item.start_date),
            ) + 1;

          const left = isMilestone
            ? startIdx * dayW + dayW / 2
            : startIdx * dayW;
          const width = isMilestone ? 0 : Math.max(span * dayW, 6);

          const label = withLabels ? titleWidth(item.title) : 0;
          const labelInside = !isMilestone && width >= label + 12;

          // What this item occupies horizontally, label included.
          const occupied = isMilestone
            ? DIAMOND_W + (withLabels ? label + DATE_W : 0) + LABEL_GAP
            : width + (labelInside || !withLabels ? LABEL_GAP : label + LABEL_GAP);
          const start = isMilestone ? left - DIAMOND_W / 2 : left;

          let row = rowRight.findIndex((right) => start >= right);
          if (row === -1) {
            rowRight.push(start + occupied);
            row = rowRight.length - 1;
          } else {
            rowRight[row] = start + occupied;
          }
          return { item, left, width, labelInside, row };
        });
        return {
          timeline,
          items: laneItems,
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

  // Open near today instead of at whatever month the earliest item sits in.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el || todayOffset === null || view !== "chart") return;
    el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 3);
  }, [todayOffset, view]);

  const total = visible.length;
  const totalAll = items.length;
  const filtered = total !== totalAll;

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          {KIND_FILTERS.map((k) => (
            <Chip
              key={k.key}
              active={kind === k.key}
              onClick={() => setKind(k.key)}
            >
              {k.label}
            </Chip>
          ))}
        </div>
        <GroupFilter
          timelines={orderedTimelines}
          groups={groups}
          items={items}
          selected={selectedGroups}
          onChange={setSelectedGroups}
        />
        <div className="ml-auto flex flex-wrap items-center gap-3">
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        {TIMELINE_OWNERS.map((o) => (
          <span key={o.code} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[2px]", o.dot)} />
            {o.label}
          </span>
        ))}
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <span className="bg-muted-foreground/60 size-2.5 rotate-45 rounded-[2px]" />
          Los hitos son rombos
        </span>
      </div>

      {view === "list" ? (
        <MasterList
          timelines={orderedTimelines}
          items={visible}
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
                      "sticky left-0 z-10 shrink-0 border-r",
                      laneIdx % 2 === 1 ? "bg-muted/40" : "bg-card",
                    )}
                    style={{ width: NAME_W }}
                  >
                    {/*
                      A busy lane is hundreds of pixels tall, so the name rides
                      down with the scroll instead of sitting at its middle —
                      otherwise you lose track of whose work you are reading.
                      `top-7` parks it just under the month ruler.
                    */}
                    <div
                      className={cn(
                        "sticky top-7 flex items-center gap-2 px-3",
                        laneIdx % 2 === 1 ? "bg-muted/40" : "bg-card",
                      )}
                      style={{ height: SUB_ROW_H + LANE_PAD * 2 }}
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
                      {lane.items.length}
                    </span>
                    </div>
                  </div>

                  <div className="relative" style={{ width: gridWidth }}>
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

                    {lane.items.length === 0 ? (
                      <span className="text-muted-foreground/60 absolute top-1/2 left-3 -translate-y-1/2 text-[11px] italic">
                        {filtered ? "Nada con este filtro" : "Sin elementos"}
                      </span>
                    ) : null}

                    {lane.placed.map((p) => (
                      <MasterItem
                        key={p.item.id}
                        placed={p}
                        top={LANE_PAD + p.row * SUB_ROW_H}
                        withLabel={withLabels}
                        onOpen={
                          onOpenTimeline
                            ? () => onOpenTimeline(p.item.timeline_id)
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
        {totalAll === 0
          ? "Todavía no hay nada cargado en los timelines."
          : `${total} de ${totalAll} ${totalAll === 1 ? "elemento" : "elementos"} en ${lanes.length} ${lanes.length === 1 ? "timeline" : "timelines"}.${onOpenTimeline ? " Tocá un proyecto o un elemento para abrirlo." : ""}`}
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

/**
 * Group filter: the groups of every project, nested under the project they
 * belong to, so "Creatividades" of one campaign can be picked without
 * touching another's.
 *
 * A project with nothing ticked shows everything — narrowing one campaign
 * never blanks the rest. The menu stays open while ticking.
 */
function GroupFilter({
  timelines,
  groups,
  items,
  selected,
  onChange,
}: {
  timelines: MasterTimeline[];
  groups: TimelineGroup[];
  items: TimelineItem[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  // Only offer what exists: a project's groups, plus "Sin grupo" when it
  // actually has loose items.
  const sections = React.useMemo(() => {
    const byTimeline = new Map<string, TimelineGroup[]>();
    for (const g of [...groups].sort((a, b) => a.position - b.position)) {
      const bucket = byTimeline.get(g.timeline_id);
      if (bucket) bucket.push(g);
      else byTimeline.set(g.timeline_id, [g]);
    }
    const hasLoose = new Set<string>();
    for (const it of items) if (!it.group_id) hasLoose.add(it.timeline_id);

    return timelines
      .map((t) => ({
        timeline: t,
        groups: byTimeline.get(t.id) ?? [],
        loose: hasLoose.has(t.id),
      }))
      .filter((s) => s.groups.length > 0);
  }, [timelines, groups, items]);

  function toggle(key: string) {
    onChange(
      selectedSet.has(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key],
    );
  }

  if (sections.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
            selected.length > 0
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:bg-accent",
          )}
        >
          <Layers className="size-3" />
          Grupos
          {selected.length > 0 ? (
            <span className="bg-background/25 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-96 w-72 overflow-auto p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-semibold">Grupos por proyecto</span>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
            >
              Limpiar
            </button>
          ) : null}
        </div>
        <p className="text-muted-foreground px-2 pb-2 text-[11px]">
          Un proyecto sin nada tildado muestra todo.
        </p>
        {sections.map((section) => (
          <div key={section.timeline.id} className="pb-1">
            <div className="text-muted-foreground truncate px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
              {section.timeline.name}
            </div>
            {section.groups.map((g) => (
              <GroupRow
                key={g.id}
                label={g.name}
                checked={selectedSet.has(g.id)}
                onClick={() => toggle(g.id)}
              />
            ))}
            {section.loose ? (
              <GroupRow
                label="Sin grupo"
                muted
                checked={selectedSet.has(ungroupedKey(section.timeline.id))}
                onClick={() => toggle(ungroupedKey(section.timeline.id))}
              />
            ) : null}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function GroupRow({
  label,
  checked,
  muted,
  onClick,
}: {
  label: string;
  checked: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
    >
      <span
        className={cn(
          "border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
          checked && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className={cn("truncate", muted && "text-muted-foreground italic")}>
        {label}
      </span>
    </button>
  );
}

/** One item on the calendar: a bar for a task, a diamond for a hito. */
function MasterItem({
  placed,
  top,
  withLabel,
  onOpen,
}: {
  placed: Placed;
  top: number;
  withLabel: boolean;
  onOpen?: () => void;
}) {
  const { item, left, width, labelInside } = placed;
  const colors = ownerColors(item.owner_key);
  const ownerLabel = ownerInfo(item.owner_key)?.label ?? "Sin owner";
  const start = parseISO(item.start_date);
  const end = parseISO(item.end_date);
  const isMilestone = item.kind === "milestone";
  const Tag = onOpen ? "button" : "div";

  const when = isMilestone
    ? format(start, "d MMM yyyy", { locale: es })
    : `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;

  if (isMilestone) {
    return (
      <Tag
        {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
        title={`${item.title} · ${when} · ${ownerLabel}`}
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
              {format(start, "d MMM", { locale: es })}
            </span>
          </>
        ) : null}
      </Tag>
    );
  }

  return (
    <Tag
      {...(onOpen ? { type: "button" as const, onClick: onOpen } : {})}
      title={`${item.title} · ${when} · ${ownerLabel}`}
      className={cn(
        "absolute z-10 flex items-center text-left",
        onOpen && "cursor-pointer",
      )}
      style={{ left, top, height: SUB_ROW_H }}
    >
      <span
        className={cn(
          "flex shrink-0 items-center overflow-hidden rounded-md shadow-sm",
          colors.barBg,
        )}
        style={{ width: Math.max(width - 2, 4), height: BAR_H }}
      >
        {withLabel && labelInside ? (
          <span className={cn("truncate px-1.5 text-[11px] font-medium", colors.barText)}>
            {item.title}
          </span>
        ) : null}
      </span>
      {withLabel && !labelInside ? (
        <span
          className="text-foreground/90 ml-1.5 truncate text-[11px] font-medium"
          style={{ maxWidth: TITLE_MAX_PX }}
        >
          {item.title}
        </span>
      ) : null}
    </Tag>
  );
}

/**
 * The same work as a chronological list: one line each, grouped by month,
 * ordered by start date. Nothing overlaps and nothing is truncated by
 * geometry — the fastest way to read what is coming.
 */
function MasterList({
  timelines,
  items,
  today,
  onOpenTimeline,
}: {
  timelines: MasterTimeline[];
  items: TimelineItem[];
  today: Date;
  onOpenTimeline?: (id: string) => void;
}) {
  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const t of timelines) m.set(t.id, t.name);
    return m;
  }, [timelines]);

  const months = React.useMemo(() => {
    const sorted = [...items].sort((a, b) =>
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
  }, [items]);

  if (months.length === 0) {
    return (
      <div className="bg-card text-muted-foreground rounded-xl border px-3 py-10 text-center text-sm">
        Nada para mostrar con este filtro.
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
            const start = parseISO(item.start_date);
            const end = parseISO(item.end_date);
            const isMilestone = item.kind === "milestone";
            const past = item.end_date < todayISO;
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
                    "w-32 shrink-0 text-xs tabular-nums",
                    past ? "text-muted-foreground/60" : "text-foreground",
                  )}
                >
                  {isMilestone
                    ? format(start, "EEE d MMM", { locale: es })
                    : `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM", { locale: es })}`}
                </span>
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-[2px]",
                    isMilestone && "rotate-45",
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
