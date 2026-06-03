"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Compact toolbar trigger that tucks filter controls into a popover, freeing
 * the vertical space the chips used to take from the content area. Shows a dot
 * on the trigger when any filter deviates from its default so the active state
 * stays discoverable while collapsed.
 */
export function FiltersPopover({
  active = false,
  label = "Filtros",
  align = "end",
  triggerClassName,
  contentClassName,
  children,
}: {
  active?: boolean;
  label?: string;
  align?: "start" | "center" | "end";
  triggerClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("relative", triggerClassName)}
          aria-label={active ? `${label} (activos)` : label}
        >
          <SlidersHorizontal />
          {label}
          {active ? (
            <span
              aria-hidden
              className="bg-primary ring-background absolute -right-1 -top-1 size-2.5 rounded-full ring-2"
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("w-80 space-y-4", contentClassName)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
