"use client";

import * as React from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isWeekend,
  max as dfMax,
  min as dfMin,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";

import {
  deleteTimelineGroupAction,
  renameTimelineGroupAction,
  updateTimelineItemAction,
} from "@/app/actions/timeliner";
import { OwnerDot } from "@/components/timeliner/owner-picker";
import { TIMELINER_KEY } from "@/components/timeliner/use-timeliner";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  HOLIDAY_COUNTRIES,
  ownerInfo,
  type Holiday,
  type HolidayCountry,
  type Timeline,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

const DAY_W = 32;
const ROW_H = 40;
const GROUP_H = 30;
const LEFT_W = 288;

const WEEKEND_HEADER = "bg-slate-500/25";
const WEEKEND_BODY = "bg-slate-500/15";
const TODAY_HEADER = "bg-sky-400/30";
const TODAY_BODY = "bg-sky-400/15";
const TODAY_TEXT = "text-sky-600 dark:text-sky-300 font-bold";

const WEEKDAY = ["D", "L", "M", "M", "J", "V", "S"];

/** First country (in list order) with a holiday on this date. */
function firstHolidayColor(countries: string[]): HolidayCountry | null {
  for (const c of HOLIDAY_COUNTRIES) if (countries.includes(c.code)) return c;
  return null;
}

type Preview = { id: string; start: string; end: string } | null;

function ownerColors(ownerKey: string | null) {
  const info = ownerInfo(ownerKey);
  return info
    ? { barBg: info.barBg, barText: info.barText }
    : { barBg: "bg-slate-400", barText: "text-white" };
}

export function GanttChart({
  timeline,
  groups,
  items,
  holidays,
  onEditItem,
}: {
  timeline: Timeline;
  groups: TimelineGroup[];
  items: TimelineItem[];
  holidays: Holiday[];
  onEditItem: (item: TimelineItem) => void;
}) {
  const qc = useQueryClient();
  const [preview, setPreview] = React.useState<Preview>(null);

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; start_date: string; end_date: string }) => {
      const res = await updateTimelineItemAction(vars);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const today = startOfDay(new Date());

  const { rangeStart, days } = React.useMemo(() => {
    const dates = items.flatMap((it) => [
      parseISO(it.start_date),
      parseISO(it.end_date),
    ]);
    const minD = dates.length ? dfMin(dates) : today;
    const maxD = dates.length ? dfMax(dates) : addDays(today, 28);
    const start = startOfWeek(addDays(minD, -3), { weekStartsOn: 1 });
    const end = endOfWeek(addDays(maxD, 5), { weekStartsOn: 1 });
    return { rangeStart: start, days: eachDayOfInterval({ start, end }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const gridWidth = days.length * DAY_W;

  const holidayByDate = React.useMemo(() => {
    const m = new Map<string, { countries: string[]; names: string[] }>();
    for (const h of holidays) {
      if (!timeline.holiday_countries.includes(h.country)) continue;
      const entry = m.get(h.date) ?? { countries: [], names: [] };
      entry.countries.push(h.country);
      entry.names.push(`${h.country}: ${h.name}`);
      m.set(h.date, entry);
    }
    return m;
  }, [holidays, timeline.holiday_countries]);

  const monthSegments = React.useMemo(() => {
    const segs: { label: string; left: number; width: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const m = days[i].getMonth();
      let j = i;
      while (j < days.length && days[j].getMonth() === m) j++;
      const label = format(days[i], "MMMM yyyy", { locale: es });
      segs.push({
        label: label.charAt(0).toUpperCase() + label.slice(1),
        left: i * DAY_W,
        width: (j - i) * DAY_W,
      });
      i = j;
    }
    return segs;
  }, [days]);

  // Ordered render rows: group headers interleaved with their items. With no
  // groups, items render flat.
  const rows = React.useMemo(() => {
    type Row =
      | { type: "group"; group: TimelineGroup | null; count: number }
      | { type: "item"; item: TimelineItem };
    const out: Row[] = [];
    const byGroup = new Map<string | null, TimelineItem[]>();
    for (const it of items) {
      const k = it.group_id ?? null;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k)!.push(it);
    }
    const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
    if (sortedGroups.length === 0) {
      for (const it of items) out.push({ type: "item", item: it });
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
  }, [items, groups]);

  function startDrag(
    e: React.PointerEvent,
    item: TimelineItem,
    mode: "move" | "l" | "r",
  ) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = item.start_date;
    const origEnd = item.end_date;
    let moved = false;
    let last = { start: origStart, end: origEnd };

    function onMove(ev: PointerEvent) {
      const delta = Math.round((ev.clientX - startX) / DAY_W);
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      let s = parseISO(origStart);
      let en = parseISO(origEnd);
      if (mode === "move") {
        s = addDays(s, delta);
        en = addDays(en, delta);
      } else if (mode === "l") {
        s = addDays(s, delta);
        if (s > en) s = en;
      } else {
        en = addDays(en, delta);
        if (en < s) en = s;
      }
      last = { start: format(s, "yyyy-MM-dd"), end: format(en, "yyyy-MM-dd") };
      setPreview({ id: item.id, ...last });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setPreview(null);
      if (!moved) {
        onEditItem(item);
        return;
      }
      if (last.start !== origStart || last.end !== origEnd) {
        updateMutation.mutate({
          id: item.id,
          start_date: last.start,
          end_date: last.end,
        });
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="bg-card overflow-auto rounded-xl border" style={{ maxHeight: "72vh" }}>
      <div style={{ width: LEFT_W + gridWidth, minWidth: "100%" }}>
        {/* Header */}
        <div className="bg-card sticky top-0 z-20">
          <div className="flex border-b">
            <div
              className="bg-card text-muted-foreground sticky left-0 z-30 shrink-0 border-r px-3 py-1.5 text-xs font-semibold"
              style={{ width: LEFT_W }}
            >
              Tareas e hitos
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
              className="bg-card sticky left-0 z-30 shrink-0 border-r"
              style={{ width: LEFT_W }}
            />
            <div className="flex" style={{ width: gridWidth }}>
              {days.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                const weekend = timeline.weekends_enabled && isWeekend(d);
                const entry = holidayByDate.get(iso);
                const hc = entry ? firstHolidayColor(entry.countries) : null;
                const isToday = isSameDay(d, today);
                return (
                  <div
                    key={iso}
                    title={entry ? entry.names.join("\n") : undefined}
                    className={cn(
                      "flex shrink-0 flex-col items-center justify-center border-r py-1 text-[10px] leading-tight",
                      weekend && WEEKEND_HEADER,
                      hc && hc.header,
                      isToday && TODAY_HEADER,
                    )}
                    style={{ width: DAY_W }}
                  >
                    <span className="text-muted-foreground">
                      {WEEKDAY[d.getDay()]}
                    </span>
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
        </div>

        {/* Body */}
        {items.length === 0 ? (
          <div className="text-muted-foreground flex items-center px-3 py-10 text-sm">
            Sin elementos todavía. Agregá una tarea o un hito para arrancar.
          </div>
        ) : (
          rows.map((row) => {
            if (row.type === "group") {
              return (
                <GroupHeaderRow
                  key={row.group ? row.group.id : "__ungrouped__"}
                  group={row.group}
                  count={row.count}
                  gridWidth={gridWidth}
                />
              );
            }
            const item = row.item;
            const isPrev = preview?.id === item.id;
            const s = isPrev ? preview!.start : item.start_date;
            const en = isPrev ? preview!.end : item.end_date;
            const startIdx = differenceInCalendarDays(parseISO(s), rangeStart);
            const span = differenceInCalendarDays(parseISO(en), parseISO(s)) + 1;
            const left = startIdx * DAY_W;
            const width = span * DAY_W;
            const colors = ownerColors(item.owner_key);
            const ownerLabel = ownerInfo(item.owner_key)?.label ?? "Sin owner";
            const isMilestone = item.kind === "milestone";

            return (
              <div
                key={item.id}
                className="group flex border-b last:border-b-0"
                style={{ height: ROW_H }}
              >
                <button
                  type="button"
                  onClick={() => onEditItem(item)}
                  className="bg-card hover:bg-muted/50 sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3 text-left transition-colors"
                  style={{ width: LEFT_W }}
                >
                  {isMilestone ? (
                    <span className={cn("size-3 rotate-45 rounded-[2px]", colors.barBg)} />
                  ) : (
                    <OwnerDot ownerKey={item.owner_key} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {ownerLabel} ·{" "}
                      {isMilestone
                        ? format(parseISO(item.start_date), "d MMM", { locale: es })
                        : `${format(parseISO(item.start_date), "d MMM", { locale: es })} – ${format(parseISO(item.end_date), "d MMM", { locale: es })}`}
                    </span>
                  </span>
                </button>

                <div className="relative" style={{ width: gridWidth }}>
                  <div className="absolute inset-0 flex">
                    {days.map((d) => {
                      const iso = format(d, "yyyy-MM-dd");
                      const weekend = timeline.weekends_enabled && isWeekend(d);
                      const entry = holidayByDate.get(iso);
                      const hc = entry ? firstHolidayColor(entry.countries) : null;
                      const isToday = isSameDay(d, today);
                      return (
                        <div
                          key={iso}
                          className={cn(
                            "shrink-0 border-r",
                            weekend && WEEKEND_BODY,
                            hc && hc.body,
                            isToday && TODAY_BODY,
                          )}
                          style={{ width: DAY_W }}
                        />
                      );
                    })}
                  </div>

                  {isMilestone ? (
                    <div
                      className="absolute top-1/2 z-10 -translate-y-1/2"
                      style={{ left: left + DAY_W / 2 }}
                    >
                      <div
                        onPointerDown={(e) => startDrag(e, item, "move")}
                        className={cn(
                          "size-3.5 -translate-x-1/2 rotate-45 cursor-grab rounded-[2px] border border-white/70 shadow-sm active:cursor-grabbing dark:border-black/30",
                          colors.barBg,
                        )}
                        title={item.title}
                      />
                      <span className="text-foreground/80 pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 whitespace-nowrap text-[11px] font-medium">
                        {item.title}
                      </span>
                    </div>
                  ) : (
                    <div
                      onPointerDown={(e) => startDrag(e, item, "move")}
                      className={cn(
                        "absolute top-1/2 z-10 flex -translate-y-1/2 cursor-grab items-center rounded-md shadow-sm active:cursor-grabbing",
                        colors.barBg,
                      )}
                      style={{
                        left: left + 2,
                        width: Math.max(DAY_W - 4, width - 4),
                        height: ROW_H - 16,
                      }}
                      title={item.title}
                    >
                      <span
                        onPointerDown={(e) => startDrag(e, item, "l")}
                        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md"
                      />
                      <span className={cn("truncate px-2 text-[11px] font-medium", colors.barText)}>
                        {item.title}
                      </span>
                      <span
                        onPointerDown={(e) => startDrag(e, item, "r")}
                        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function GroupHeaderRow({
  group,
  count,
  gridWidth,
}: {
  group: TimelineGroup | null;
  count: number;
  gridWidth: number;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(group?.name ?? "");

  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await renameTimelineGroupAction({ id: group!.id, name });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
    },
    onError: (err: Error) => {
      showToast({ title: err.message });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await deleteTimelineGroupAction(group!.id);
      if (!res.ok) throw new Error(res.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function commit() {
    const trimmed = draft.trim();
    if (group && trimmed && trimmed !== group.name) renameMutation.mutate(trimmed);
    else {
      setDraft(group?.name ?? "");
      setEditing(false);
    }
  }

  return (
    <div className="flex border-b" style={{ height: GROUP_H }}>
      <div
        className="bg-muted sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3"
        style={{ width: LEFT_W }}
      >
        {group && editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                setDraft(group.name);
                setEditing(false);
              }
            }}
            className="h-6 text-xs font-semibold"
          />
        ) : group ? (
          <button
            type="button"
            onClick={() => {
              setDraft(group.name);
              setEditing(true);
            }}
            className="hover:bg-foreground/5 -mx-1 truncate rounded px-1 text-left text-xs font-semibold uppercase tracking-wide"
            title="Click para renombrar"
          >
            {group.name}
          </button>
        ) : (
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Sin grupo
          </span>
        )}
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {count}
        </span>
        {group ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`¿Eliminar el grupo "${group.name}"? Sus tareas quedan sin grupo.`))
                deleteMutation.mutate();
            }}
            className="text-muted-foreground hover:text-destructive ml-auto inline-flex size-5 items-center justify-center rounded"
            aria-label={`Eliminar grupo ${group.name}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      <div className="bg-muted/40" style={{ width: gridWidth }} />
    </div>
  );
}
