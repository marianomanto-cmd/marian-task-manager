"use client";

import * as React from "react";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";

const WEEK_STARTS_ON = 1 as const; // Monday — matches AR/ES conventions

export function getMonthGridRange(monthAnchor: Date): {
  gridStart: Date;
  gridEnd: Date;
  /** Always 6 rows × 7 cols = 42 dates. */
  days: Date[];
} {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON });

  const days: Date[] = [];
  let cursor = gridStart;
  // 6 weeks max — covers any month layout.
  for (let i = 0; i < 42; i += 1) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    if (cursor > gridEnd && days.length % 7 === 0) break;
  }
  // Pad to 6 rows if the month is short.
  while (days.length < 42) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return { gridStart, gridEnd: cursor, days };
}

type MonthGridProps = {
  month: Date;
  selectedDate?: Date;
  onSelectDate?: (date: Date) => void;
  renderCell?: (date: Date, ctx: { inMonth: boolean; isToday: boolean }) => React.ReactNode;
  weekdayLabels?: readonly string[];
};

const DEFAULT_WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

export function MonthGrid({
  month,
  selectedDate,
  onSelectDate,
  renderCell,
  weekdayLabels = DEFAULT_WEEKDAYS,
}: MonthGridProps) {
  const { days } = React.useMemo(() => getMonthGridRange(month), [month]);
  const today = React.useMemo(() => new Date(), []);

  return (
    <div className="bg-card overflow-hidden rounded-lg border">
      <div className="bg-muted/50 text-muted-foreground grid grid-cols-7 text-[11px] font-medium uppercase">
        {weekdayLabels.map((label) => (
          <div key={label} className="py-1.5 text-center">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const inMonth = isSameMonth(date, month);
          const isToday = isSameDay(date, today);
          const isSelected = selectedDate
            ? isSameDay(date, selectedDate)
            : false;

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate?.(date)}
              className={cn(
                "group/cell relative flex min-h-20 flex-col items-stretch gap-1 border-t border-l p-1.5 text-left transition-colors first:border-l-0 hover:bg-accent/40 sm:min-h-24",
                !inMonth && "bg-muted/20 text-muted-foreground",
                isSelected && "bg-accent/60",
              )}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={format(date, "EEEE d 'de' MMMM", { locale: es })}
            >
              <span
                className={cn(
                  "text-xs font-medium leading-none",
                  isToday &&
                    "bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full",
                )}
              >
                {date.getDate()}
              </span>
              {renderCell ? (
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {renderCell(date, { inMonth, isToday })}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
