"use client";

import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { colorForMemberKey, getMemberByKey, TEAM_MEMBERS } from "@/lib/team/members";
import { cn } from "@/lib/utils";

export function OwnerDot({ ownerKey }: { ownerKey: string | null }) {
  if (!ownerKey) {
    return <span className="bg-muted-foreground/30 size-2.5 rounded-full" />;
  }
  return (
    <span
      className={cn("size-2.5 rounded-full", colorForMemberKey(ownerKey).barBg)}
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
  const member = value ? getMemberByKey(value) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-input hover:bg-accent inline-flex h-9 w-full items-center gap-2 rounded-md border bg-transparent px-2 text-sm"
        >
          <OwnerDot ownerKey={value} />
          <span className={cn(!member && "text-muted-foreground")}>
            {member?.name ?? "Sin owner"}
          </span>
          <ChevronDown className="text-muted-foreground ml-auto size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <OwnerDot ownerKey={null} />
          Sin owner
        </DropdownMenuItem>
        {TEAM_MEMBERS.map((m) => (
          <DropdownMenuItem key={m.key} onClick={() => onChange(m.key)}>
            <OwnerDot ownerKey={m.key} />
            {m.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
