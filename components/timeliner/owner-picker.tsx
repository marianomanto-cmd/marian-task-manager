"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ownerInfo, TIMELINE_OWNERS } from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

export function OwnerDot({ ownerKey }: { ownerKey: string | null }) {
  const info = ownerInfo(ownerKey);
  return (
    <span
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        info ? info.dot : "bg-muted-foreground/30",
      )}
    />
  );
}

export function OwnerPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const info = ownerInfo(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-input hover:bg-accent inline-flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-2 text-sm"
        >
          <OwnerDot ownerKey={value} />
          <span className={cn(!info && "text-muted-foreground")}>
            {info?.label ?? "Sin owner"}
          </span>
          <ChevronDown className="text-muted-foreground ml-auto size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <OwnerDot ownerKey={null} />
          Sin owner
        </DropdownMenuItem>
        {TIMELINE_OWNERS.map((o) => (
          <DropdownMenuItem key={o.code} onClick={() => onChange(o.code)}>
            <OwnerDot ownerKey={o.code} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
