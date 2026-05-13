"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterOption<T extends string> = {
  value: T;
  label: string;
};

export function FilterChips<T extends string>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly FilterOption<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
}) {
  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        {label}
      </span>
      {options.map((opt) => {
        const isOn = selected.includes(opt.value);
        return (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={isOn ? "default" : "outline"}
            onClick={() => toggle(opt.value)}
            className={cn("h-7 rounded-full px-2.5 text-xs")}
          >
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
