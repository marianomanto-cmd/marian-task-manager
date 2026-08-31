"use client";

import * as React from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  isWeekend,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Star, Trash2 } from "lucide-react";

import {
  createTimelineDependencyAction,
  deleteTimelineGroupAction,
  renameTimelineGroupAction,
  reorderTimelineItemsAction,
  rescheduleTimelineItemsAction,
  updateTimelineItemAction,
} from "@/app/actions/timeliner";
import {
  DependencyArrows,
  type DraftLink,
} from "@/components/timeliner/dependency-arrows";
import { DependencyEditor } from "@/components/timeliner/dependency-editor";
import { OwnerDot } from "@/components/timeliner/owner-picker";
import {
  TIMELINER_KEY,
  type TimelinerQueryResult,
} from "@/components/timeliner/use-timeliner";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  DAY_W,
  GROUP_H,
  LEFT_W,
  ROW_H,
  TODAY_BODY,
  TODAY_HEADER,
  TODAY_TEXT,
  WEEKDAY,
  WEEKEND_BODY,
  WEEKEND_HEADER,
  buildDayRange,
  buildHolidayMap,
  buildMonthSegments,
  buildRowLayout,
  buildRows,
  firstHolidayColor,
  ownerColors,
  sortTimelineItems,
} from "@/lib/timeliner/grid";
import { cascadeSchedule, type DateChange } from "@/lib/timeliner/schedule";
import {
  dependencyTypeFor,
  ownerInfo,
  type DependencyEndpoint,
  type Holiday,
  type Timeline,
  type TimelineDependency,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/**
 * Dates being dragged, by item id: the bar under the cursor plus everything
 * the dependency graph is pushing along with it. Null when nothing is moving.
 */
type Preview = Map<string, { start: string; end: string }> | null;

/** A bar the pointer can drop a link on — see `startLink`. */
function barUnderPointer(
  clientX: number,
  clientY: number,
): { id: string; side: DependencyEndpoint } | null {
  const el = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>("[data-bar-item]");
  if (!el) return null;
  const id = el.dataset.barItem;
  if (!id) return null;
  const rect = el.getBoundingClientRect();
  // Frappe's rule, and the one that reads right: the half you drop on picks
  // the endpoint — left half is the task's start, right half its finish.
  return { id, side: clientX < rect.left + rect.width / 2 ? "start" : "end" };
}

export function GanttChart({
  timeline,
  groups,
  items,
  dependencies,
  holidays,
  onEditItem,
}: {
  timeline: Timeline;
  groups: TimelineGroup[];
  items: TimelineItem[];
  dependencies: TimelineDependency[];
  holidays: Holiday[];
  onEditItem: (item: TimelineItem) => void;
}) {
  const qc = useQueryClient();
  const [preview, setPreview] = React.useState<Preview>(null);
  // Link being dragged out of a bar tip, and the arrow whose editor is open.
  const [draftLink, setDraftLink] = React.useState<DraftLink | null>(null);
  const [editingDep, setEditingDep] = React.useState<TimelineDependency | null>(
    null,
  );
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  // Read inside pointer handlers, which run long after the render that set
  // them up — a ref keeps the cascade working off current data without
  // re-binding a listener on every keystroke elsewhere on the board.
  const itemsRef = React.useRef(items);
  const depsRef = React.useRef(dependencies);
  React.useEffect(() => {
    itemsRef.current = items;
    depsRef.current = dependencies;
  }, [items, dependencies]);
  // Vertical drag-to-reorder: which row is being dragged and where it would
  // land (insertion index in the flat item list). Null when not dragging.
  const [reorder, setReorder] = React.useState<{
    id: string;
    overIndex: number;
  } | null>(null);
  const rowElRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  /** Patch item rows in the cache without waiting for a refetch. */
  const applyLocalDates = React.useCallback(
    (changes: readonly DateChange[]) => {
      const patch = new Map(changes.map((c) => [c.id, c]));
      qc.setQueryData<TimelinerQueryResult>(TIMELINER_KEY, (old) => {
        if (!old || old.error !== null) return old;
        return {
          ...old,
          data: {
            ...old.data,
            items: old.data.items.map((it) => {
              const c = patch.get(it.id);
              return c
                ? { ...it, start_date: c.start_date, end_date: c.end_date }
                : it;
            }),
          },
        };
      });
    },
    [qc],
  );

  /**
   * Commit a drag: the bar that moved plus every item its dependencies pushed.
   * One write for the batch, applied optimistically first so the bars don't
   * snap back to their old dates while the round trip lands.
   */
  const rescheduleMutation = useMutation({
    mutationFn: async (vars: { items: DateChange[] }) => {
      const res = await rescheduleTimelineItemsAction({
        timeline_id: timeline.id,
        items: vars.items,
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: TIMELINER_KEY });
      const prev = qc.getQueryData<TimelinerQueryResult>(TIMELINER_KEY);
      applyLocalDates(vars.items);
      // Only now is the cache holding the dates the drag preview was showing,
      // so dropping the preview here hands over without a frame of snap-back.
      setPreview(null);
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(TIMELINER_KEY, ctx.prev);
      showToast({ title: err.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
  });

  const starMutation = useMutation({
    mutationFn: async (vars: { id: string; is_key: boolean }) => {
      const res = await updateTimelineItemAction(vars);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const linkMutation = useMutation({
    mutationFn: async (vars: {
      from_item_id: string;
      to_item_id: string;
      dep_type: string;
    }) => {
      const res = await createTimelineDependencyAction({
        timeline_id: timeline.id,
        ...vars,
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (vars: {
      items: { id: string; group_id: string | null; position: number }[];
    }) => {
      const res = await reorderTimelineItemsAction({
        timeline_id: timeline.id,
        items: vars.items,
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    // Optimistically apply the new positions/groups so the reorder shows
    // instantly; roll back on error and always resync afterwards.
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: TIMELINER_KEY });
      const prev = qc.getQueryData<TimelinerQueryResult>(TIMELINER_KEY);
      qc.setQueryData<TimelinerQueryResult>(TIMELINER_KEY, (old) => {
        if (!old || old.error !== null) return old;
        const patch = new Map(vars.items.map((i) => [i.id, i]));
        const nextItems = old.data.items.map((it) => {
          const p = patch.get(it.id);
          return p
            ? { ...it, position: p.position, group_id: p.group_id }
            : it;
        });
        return { ...old, data: { ...old.data, items: nextItems } };
      });
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(TIMELINER_KEY, ctx.prev);
      showToast({ title: err.message });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
  });

  const today = startOfDay(new Date());

  const { rangeStart, days } = React.useMemo(
    () => buildDayRange(items, today),
    // `today` only matters for an empty timeline and would change identity on
    // every render; the item spans are what the range really depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  const gridWidth = days.length * DAY_W;

  const holidayByDate = React.useMemo(
    () => buildHolidayMap(holidays, timeline.holiday_countries),
    [holidays, timeline.holiday_countries],
  );

  const monthSegments = React.useMemo(() => buildMonthSegments(days), [days]);

  const sortedItems = React.useMemo(() => sortTimelineItems(items), [items]);

  const rows = React.useMemo(
    () => buildRows(sortedItems, groups),
    [sortedItems, groups],
  );

  const rowLayout = React.useMemo(() => buildRowLayout(rows), [rows]);

  /**
   * The items as they look right now, drag included. Arrows read these, so a
   * chain follows the cursor instead of snapping into place on release.
   */
  const previewedItems = React.useMemo(() => {
    if (!preview) return items;
    return items.map((it) => {
      const p = preview.get(it.id);
      return p ? { ...it, start_date: p.start, end_date: p.end } : it;
    });
  }, [items, preview]);

  // Flat list of items in the exact top-to-bottom order they render, and a
  // lookup of each item's index within it — the basis for reorder math.
  const orderedItems = React.useMemo(() => {
    const out: TimelineItem[] = [];
    for (const r of rows) if (r.type === "item") out.push(r.item);
    return out;
  }, [rows]);
  const itemIndexById = React.useMemo(() => {
    const m = new Map<string, number>();
    orderedItems.forEach((it, i) => m.set(it.id, i));
    return m;
  }, [orderedItems]);

  // While dragging, suppress the drop line when the target is the row's own
  // slot (dropping there changes nothing) so it doesn't flicker beside it.
  const reorderFromIndex = reorder
    ? itemIndexById.get(reorder.id) ?? -1
    : -1;
  const reorderIsNoop =
    reorder !== null &&
    (reorder.overIndex === reorderFromIndex ||
      reorder.overIndex === reorderFromIndex + 1);

  /** Persist a drop: the dragged row lands at insertion index `overIndex`. */
  function commitReorder(id: string, overIndex: number) {
    const from = orderedItems.findIndex((i) => i.id === id);
    if (from < 0) return;
    // Dropped back into its own slot → nothing to do.
    if (overIndex === from || overIndex === from + 1) return;

    const dragged = orderedItems[from];
    const without = orderedItems.filter((_, k) => k !== from);
    let insertAt = overIndex <= from ? overIndex : overIndex - 1;
    insertAt = Math.max(0, Math.min(insertAt, without.length));

    // Adopt the group of the neighbour it's dropped next to (above first,
    // else below), so dragging across group sections moves it there too.
    const above = without[insertAt - 1];
    const below = without[insertAt];
    const newGroupId = above
      ? above.group_id
      : below
        ? below.group_id
        : dragged.group_id;

    const finalOrder = [
      ...without.slice(0, insertAt),
      { ...dragged, group_id: newGroupId },
      ...without.slice(insertAt),
    ];

    // Send only the rows whose position or group actually changed.
    const changed = finalOrder
      .map((it, idx) => ({ it, idx }))
      .filter(({ it, idx }) => {
        const orig = orderedItems.find((o) => o.id === it.id)!;
        return (
          orig.position !== idx ||
          (orig.group_id ?? null) !== (it.group_id ?? null)
        );
      })
      .map(({ it, idx }) => ({
        id: it.id,
        group_id: it.group_id ?? null,
        position: idx,
      }));

    if (changed.length === 0) return;
    reorderMutation.mutate({ items: changed });
  }

  /** Start a vertical drag from a row's grip handle. */
  function startReorder(e: React.PointerEvent, item: TimelineItem) {
    e.preventDefault();
    e.stopPropagation();
    const from = orderedItems.findIndex((i) => i.id === item.id);
    if (from < 0) return;
    let over = from;
    setReorder({ id: item.id, overIndex: from });

    function computeOver(clientY: number): number {
      for (let k = 0; k < orderedItems.length; k++) {
        const el = rowElRefs.current.get(orderedItems[k].id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) return k;
      }
      return orderedItems.length;
    }

    function onMove(ev: PointerEvent) {
      over = computeOver(ev.clientY);
      setReorder((d) => (d ? { ...d, overIndex: over } : d));
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setReorder(null);
      commitReorder(item.id, over);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

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
    let lastBatch: DateChange[] = [];

    /** The dragged bar plus whatever its dependencies drag along behind it. */
    function withCascade(): DateChange[] {
      const primary: DateChange = {
        id: item.id,
        start_date: last.start,
        end_date: last.end,
      };
      return [
        primary,
        ...cascadeSchedule(itemsRef.current, depsRef.current, [primary]),
      ];
    }

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
      lastBatch = withCascade();
      setPreview(new Map(lastBatch.map((c) => [c.id, { start: c.start_date, end: c.end_date }])));
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      // A press that never moved is a click: open the editor.
      if (!moved) {
        setPreview(null);
        onEditItem(item);
        return;
      }
      if (last.start !== origStart || last.end !== origEnd) {
        // The preview is cleared by the mutation, once the new dates are in.
        rescheduleMutation.mutate({ items: lastBatch });
      } else {
        setPreview(null);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /**
   * Drag a link out of a bar tip. The line follows the cursor and lands on
   * whatever bar is under it; which half of that bar takes the drop decides
   * whether the link ties to its start or its finish, and that pair of
   * endpoints is the dependency type (finish→start, start→start, …).
   */
  function startLink(
    e: React.PointerEvent,
    item: TimelineItem,
    side: DependencyEndpoint,
  ) {
    e.preventDefault();
    e.stopPropagation();
    let landed: { id: string; side: DependencyEndpoint } | null = null;

    function toGrid(ev: PointerEvent): { x: number; y: number } {
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: ev.clientX - rect.left - LEFT_W, y: ev.clientY - rect.top };
    }

    function onMove(ev: PointerEvent) {
      const hit = barUnderPointer(ev.clientX, ev.clientY);
      landed = hit && hit.id !== item.id ? hit : null;
      const { x, y } = toGrid(ev);
      setDraftLink({
        fromId: item.id,
        fromSide: side,
        x,
        y,
        targetId: landed?.id ?? null,
      });
    }

    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraftLink(null);
      if (!landed) return;
      linkMutation.mutate({
        from_item_id: item.id,
        to_item_id: landed.id,
        dep_type: dependencyTypeFor(side, landed.side),
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="bg-card overflow-auto rounded-xl border" style={{ maxHeight: "72vh" }}>
      <div style={{ width: LEFT_W + gridWidth, minWidth: "100%" }}>
        {/* Header */}
        <div className="bg-card sticky top-0 z-30">
          <div className="flex border-b">
            <div
              className="bg-card text-muted-foreground sticky left-0 z-40 shrink-0 border-r px-3 py-1.5 text-xs font-semibold"
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
              className="bg-card sticky left-0 z-40 shrink-0 border-r"
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
          <div className="relative" ref={bodyRef}>
          <DependencyArrows
            items={previewedItems}
            dependencies={dependencies}
            topById={rowLayout.topById}
            rangeStart={rangeStart}
            gridWidth={gridWidth}
            height={rowLayout.height}
            selectedId={editingDep?.id ?? null}
            onSelect={setEditingDep}
            draft={draftLink}
          />
          {rows.map((row) => {
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
            const prev = preview?.get(item.id);
            const s = prev ? prev.start : item.start_date;
            const en = prev ? prev.end : item.end_date;
            const startIdx = differenceInCalendarDays(parseISO(s), rangeStart);
            const span = differenceInCalendarDays(parseISO(en), parseISO(s)) + 1;
            const left = startIdx * DAY_W;
            const width = span * DAY_W;
            const colors = ownerColors(item.owner_key);
            const ownerLabel = ownerInfo(item.owner_key)?.label ?? "Sin owner";
            const isMilestone = item.kind === "milestone";
            const myIndex = itemIndexById.get(item.id) ?? 0;
            const isDragging = reorder?.id === item.id;
            const isLinkTarget = draftLink?.targetId === item.id;
            const showDropAbove =
              reorder !== null &&
              !reorderIsNoop &&
              reorder.overIndex === myIndex;
            const showDropBelow =
              reorder !== null &&
              !reorderIsNoop &&
              myIndex === orderedItems.length - 1 &&
              reorder.overIndex === orderedItems.length;

            return (
              <div
                key={item.id}
                ref={(el) => {
                  // Ref callbacks run at commit; storing the row node here for
                  // later geometry (drag math) is safe, not a render-time read.
                  const m = rowElRefs.current;
                  if (el) m.set(item.id, el);
                  else m.delete(item.id);
                }}
                className={cn(
                  "group relative flex border-b last:border-b-0",
                  isDragging && "opacity-40",
                )}
                style={{ height: ROW_H }}
              >
                {showDropAbove ? (
                  <div className="bg-primary pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 -translate-y-px" />
                ) : null}
                {showDropBelow ? (
                  <div className="bg-primary pointer-events-none absolute inset-x-0 bottom-0 z-30 h-0.5 translate-y-px" />
                ) : null}
                <div
                  className="bg-card sticky left-0 z-20 flex shrink-0 items-stretch border-r"
                  style={{ width: LEFT_W }}
                >
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label="Arrastrar para reordenar"
                    title="Arrastrá para reordenar"
                    onPointerDown={(e) => {
                      // Reads the row refs only inside deferred pointer handlers.
                      startReorder(e, item);
                    }}
                    className="text-muted-foreground/30 hover:text-foreground flex shrink-0 cursor-grab touch-none items-center pl-1.5 pr-0.5 transition-colors active:cursor-grabbing"
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => onEditItem(item)}
                    className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 pr-3 pl-0.5 text-left transition-colors"
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
                  {isMilestone ? null : (
                    <button
                      type="button"
                      onClick={() =>
                        starMutation.mutate({ id: item.id, is_key: !item.is_key })
                      }
                      title={
                        item.is_key
                          ? "Quitar del MASTER"
                          : "Destacar en el MASTER"
                      }
                      aria-pressed={item.is_key}
                      className={cn(
                        "mr-2 inline-flex size-6 shrink-0 items-center justify-center self-center rounded transition",
                        item.is_key
                          ? "text-amber-500"
                          : "text-muted-foreground/30 hover:text-amber-500 opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <Star
                        className="size-3.5"
                        fill={item.is_key ? "currentColor" : "none"}
                      />
                    </button>
                  )}
                </div>

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
                      data-bar-item={item.id}
                      className={cn(
                        "absolute top-1/2 z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px]",
                        isLinkTarget && "ring-primary rounded-full ring-2 ring-offset-1",
                      )}
                      style={{ left: left + DAY_W / 2 }}
                    >
                      <div
                        onPointerDown={(e) => startDrag(e, item, "move")}
                        className={cn(
                          "size-full rotate-45 cursor-grab rounded-[2px] border border-white/70 shadow-sm active:cursor-grabbing dark:border-black/30",
                          colors.barBg,
                        )}
                        title={item.title}
                      />
                      <LinkHandle side="start" onPointerDown={(e) => startLink(e, item, "start")} />
                      <LinkHandle side="end" onPointerDown={(e) => startLink(e, item, "end")} />
                      <span className="text-foreground/80 pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 whitespace-nowrap text-[11px] font-medium">
                        {item.title}
                      </span>
                    </div>
                  ) : (
                    <div
                      data-bar-item={item.id}
                      onPointerDown={(e) => startDrag(e, item, "move")}
                      className={cn(
                        "absolute top-1/2 z-10 flex -translate-y-1/2 cursor-grab items-center rounded-md shadow-sm active:cursor-grabbing",
                        colors.barBg,
                        isLinkTarget && "ring-primary ring-2 ring-offset-1",
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
                      <LinkHandle side="start" onPointerDown={(e) => startLink(e, item, "start")} />
                      <LinkHandle side="end" onPointerDown={(e) => startLink(e, item, "end")} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      <DependencyEditor
        key={editingDep?.id ?? "none"}
        dependency={editingDep}
        from={items.find((i) => i.id === editingDep?.from_item_id)}
        to={items.find((i) => i.id === editingDep?.to_item_id)}
        onClose={() => setEditingDep(null)}
      />
    </div>
  );
}

/**
 * The little circle at a bar tip you pull a dependency out of. Hidden until
 * the row is hovered so the chart stays clean, and always live during a link
 * drag so it can also act as a drop target.
 */
function LinkHandle({
  side,
  onPointerDown,
}: {
  side: DependencyEndpoint;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={
        side === "start"
          ? "Crear dependencia desde el inicio"
          : "Crear dependencia desde el fin"
      }
      title="Arrastrá hasta otra tarea para vincularlas"
      onPointerDown={onPointerDown}
      className={cn(
        "border-primary bg-background absolute top-1/2 z-20 size-2.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 opacity-0 shadow-sm transition-opacity",
        "group-hover:opacity-100 hover:scale-125",
        side === "start" ? "-left-1.5" : "-right-1.5",
      )}
    />
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
        className="bg-muted sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r px-3"
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
