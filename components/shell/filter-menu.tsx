"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterMenuOption<T extends string> = {
  value: T;
  label: string;
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-primary text-primary-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
      {children}
    </span>
  );
}

function MenuRow({
  checked,
  label,
  onClick,
  single,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
  single?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
    >
      <span
        className={cn(
          "border-input flex size-4 shrink-0 items-center justify-center border",
          single ? "rounded-full" : "rounded-[4px]",
          checked && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {checked ? <Check className="size-3" /> : null}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Multi-select filter as a compact toolbar dropdown. The menu stays open while
 * toggling (it's a Popover, not a select), and the trigger shows a count badge
 * when the selection is narrowed. Empty / full selection both mean "all" on the
 * server, so neither counts as narrowed.
 */
export function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onChange,
  align = "start",
  className,
}: {
  label: string;
  options: readonly FilterMenuOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const narrowed = selected.length > 0 && selected.length < options.length;

  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-1.5", className)}
        >
          <span>{label}</span>
          {narrowed ? <Badge>{selected.length}</Badge> : null}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-52 p-1">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            {label}
          </span>
          {selected.length !== options.length ? (
            <button
              type="button"
              onClick={() => onChange(options.map((o) => o.value))}
              className="text-primary text-xs hover:underline"
            >
              Todos
            </button>
          ) : null}
        </div>
        <ul className="max-h-72 overflow-auto">
          {options.map((opt) => (
            <li key={opt.value}>
              <MenuRow
                checked={selected.includes(opt.value)}
                label={opt.label}
                onClick={() => toggle(opt.value)}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Single-select variant (radio-style) for filters like "Cliente" where exactly
 * one bucket is in focus at a time. `null` is the "all" value and never narrows.
 * An optional footer hosts extras (e.g. client management).
 */
export function SingleFilterMenu({
  label,
  value,
  options,
  onChange,
  align = "start",
  className,
  contentClassName,
  footer,
}: {
  label: string;
  value: string | null;
  options: readonly { value: string | null; label: string }[];
  onChange: (next: string | null) => void;
  align?: "start" | "center" | "end";
  className?: string;
  contentClassName?: string;
  footer?: React.ReactNode;
}) {
  const current = options.find((o) => o.value === value);
  const narrowed = value !== null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("max-w-[12rem] gap-1.5", className)}
        >
          <span className="truncate">
            {label}
            {narrowed && current ? `: ${current.label}` : ""}
          </span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn("w-56 p-1", contentClassName)}>
        <ul className="max-h-72 overflow-auto">
          {options.map((opt) => (
            <li key={opt.value ?? "__all__"}>
              <MenuRow
                single
                checked={opt.value === value}
                label={opt.label}
                onClick={() => onChange(opt.value)}
              />
            </li>
          ))}
        </ul>
        {footer}
      </PopoverContent>
    </Popover>
  );
}
