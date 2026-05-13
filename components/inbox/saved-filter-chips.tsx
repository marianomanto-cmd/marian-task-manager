"use client";

import * as React from "react";
import { X } from "lucide-react";

import {
  useDeleteSavedFilter,
  useSavedFilters,
} from "@/components/inbox/use-saved-filters";
import { showToast } from "@/components/ui/toast";
import { filtersAreEqual, type InboxFilter } from "@/lib/inbox/filter";
import { cn } from "@/lib/utils";

export function SavedFilterChips({
  current,
  onApply,
}: {
  current: InboxFilter;
  onApply: (criteria: InboxFilter) => void;
}) {
  const { data: filters } = useSavedFilters();
  const deleteMutation = useDeleteSavedFilter();
  const items = filters ?? [];

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((f) => {
        const active = filtersAreEqual(f.criteria, current);
        return (
          <span
            key={f.id}
            className={cn(
              "group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <button
              type="button"
              onClick={() => onApply(f.criteria)}
              className="font-medium"
            >
              {f.name}
            </button>
            <button
              type="button"
              aria-label={`Eliminar filtro ${f.name}`}
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(f.id);
                  showToast({ title: `Filtro "${f.name}" eliminado` });
                } catch (err) {
                  showToast({
                    title:
                      err instanceof Error ? err.message : "Error desconocido",
                  });
                }
              }}
              className={cn(
                "opacity-60 hover:opacity-100",
                active ? "" : "hidden group-hover:inline-flex",
              )}
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
