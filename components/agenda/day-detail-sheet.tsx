"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil } from "lucide-react";

import { useIsDesktop } from "@/components/hooks/use-is-desktop";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { HOLIDAY_COUNTRY_META, type Holiday } from "@/lib/holidays/types";
import type { OooEntry } from "@/lib/ooo/types";
import { cn } from "@/lib/utils";

export type DayDetailSheetProps = {
  /** YYYY-MM-DD wall-clock date the sheet refers to. */
  dateKey: string | null;
  holidays: Holiday[];
  oooEntries: OooEntry[];
  onClose: () => void;
  onEditOoo: (entry: OooEntry) => void;
  onCreateOoo: (dateKey: string) => void;
};

export function DayDetailSheet({
  dateKey,
  holidays,
  oooEntries,
  onClose,
  onEditOoo,
  onCreateOoo,
}: DayDetailSheetProps) {
  const isDesktop = useIsDesktop();
  const open = dateKey !== null;

  const title = dateKey
    ? format(parseISO(dateKey), "EEEE d 'de' MMMM yyyy", { locale: es }).replace(
        /^\w/,
        (c) => c.toUpperCase(),
      )
    : "";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isDesktop ? "sm:max-w-md" : "max-h-[85vh]",
        )}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-base">{title}</SheetTitle>
          <SheetDescription className="text-xs">
            {holidays.length + oooEntries.length === 0
              ? "Sin feriados ni OOO."
              : `${holidays.length} feriado${holidays.length === 1 ? "" : "s"} · ${oooEntries.length} OOO`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {holidays.length > 0 ? (
            <section className="space-y-2">
              <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                Feriados
              </p>
              <ul className="space-y-1.5">
                {holidays.map((h) => {
                  const meta = HOLIDAY_COUNTRY_META[h.country];
                  return (
                    <li
                      key={h.id}
                      className="flex items-start gap-2 text-sm"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          meta.color,
                        )}
                        aria-hidden
                      />
                      <span className="flex-1">
                        <span className="block">{h.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {meta.label}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {oooEntries.length > 0 ? (
            <section className="space-y-2">
              <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                Equipo fuera
              </p>
              <ul className="space-y-1">
                {oooEntries.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onEditOoo(entry)}
                      className="hover:bg-accent/40 flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-tight">
                          {entry.member_name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {entry.start_date === entry.end_date
                            ? format(parseISO(entry.start_date), "d MMM", {
                                locale: es,
                              })
                            : `${format(parseISO(entry.start_date), "d MMM", { locale: es })} – ${format(parseISO(entry.end_date), "d MMM", { locale: es })}`}
                          {entry.reason ? ` · ${entry.reason}` : ""}
                        </span>
                      </span>
                      <Pencil className="text-muted-foreground size-3.5 shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {holidays.length + oooEntries.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Día sin novedades.
            </p>
          ) : null}
        </div>

        {dateKey ? (
          <div className="border-t p-4">
            <Button
              type="button"
              className="w-full"
              onClick={() => onCreateOoo(dateKey)}
            >
              Cargar OOO ese día
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
