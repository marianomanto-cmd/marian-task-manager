"use client";

import * as React from "react";
import { differenceInCalendarDays, format, isSameDay, isWeekend, parseISO, startOfDay } from "date-fns";
import { es } from "date-fns/locale";

import { OwnerDot } from "@/components/timeliner/owner-picker";
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
  buildRows,
  firstHolidayColor,
  ownerColors,
  sortTimelineItems,
} from "@/lib/timeliner/grid";
import {
  ownerInfo,
  type Holiday,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/**
 * Read-only twin of `GanttChart`, for the public share link. Same geometry
 * (both build their grid from `lib/timeliner/grid`), minus every affordance
 * that writes: no drag to move or stretch, no reorder handle, no editing.
 */
export function PublicGantt({
  timeline,
  groups,
  items,
  holidays,
}: {
  timeline: { weekends_enabled: boolean; holiday_countries: string[] };
  groups: TimelineGroup[];
  items: TimelineItem[];
  holidays: Holiday[];
}) {
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

  const rows = React.useMemo(
    () => buildRows(sortTimelineItems(items), groups),
    [items, groups],
  );

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
            Todavía no hay tareas ni hitos cargados en este timeline.
          </div>
        ) : (
          rows.map((row) => {
            if (row.type === "group") {
              return (
                <div
                  key={row.group ? row.group.id : "__ungrouped__"}
                  className="flex border-b"
                  style={{ height: GROUP_H }}
                >
                  <div
                    className="bg-muted sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3"
                    style={{ width: LEFT_W }}
                  >
                    <span
                      className={cn(
                        "truncate text-xs font-semibold uppercase tracking-wide",
                        !row.group && "text-muted-foreground",
                      )}
                    >
                      {row.group ? row.group.name : "Sin grupo"}
                    </span>
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {row.count}
                    </span>
                  </div>
                  <div className="bg-muted/40" style={{ width: gridWidth }} />
                </div>
              );
            }

            const item = row.item;
            const startIdx = differenceInCalendarDays(
              parseISO(item.start_date),
              rangeStart,
            );
            const span =
              differenceInCalendarDays(
                parseISO(item.end_date),
                parseISO(item.start_date),
              ) + 1;
            const left = startIdx * DAY_W;
            const width = span * DAY_W;
            const colors = ownerColors(item.owner_key);
            const ownerLabel = ownerInfo(item.owner_key)?.label ?? "Sin owner";
            const isMilestone = item.kind === "milestone";

            return (
              <div
                key={item.id}
                className="relative flex border-b last:border-b-0"
                style={{ height: ROW_H }}
              >
                <div
                  className="bg-card sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r px-3"
                  style={{ width: LEFT_W }}
                >
                  {isMilestone ? (
                    <span
                      className={cn(
                        "size-3 shrink-0 rotate-45 rounded-[2px]",
                        colors.barBg,
                      )}
                    />
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
                      className="absolute top-1/2 z-10 -translate-y-1/2"
                      style={{ left: left + DAY_W / 2 }}
                    >
                      <div
                        className={cn(
                          "size-3.5 -translate-x-1/2 rotate-45 rounded-[2px] border border-white/70 shadow-sm dark:border-black/30",
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
                      className={cn(
                        "absolute top-1/2 z-10 flex -translate-y-1/2 items-center rounded-md shadow-sm",
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
                        className={cn(
                          "truncate px-2 text-[11px] font-medium",
                          colors.barText,
                        )}
                      >
                        {item.title}
                      </span>
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
