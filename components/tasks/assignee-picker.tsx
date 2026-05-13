"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { TEAM_MEMBERS } from "@/lib/team/members";
import { cn } from "@/lib/utils";

export function AssigneePicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(key: string) {
    if (value.includes(key)) {
      onChange(value.filter((k) => k !== key));
    } else {
      onChange([...value, key]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {TEAM_MEMBERS.map((member) => {
        const isOn = value.includes(member.key);
        return (
          <Button
            key={member.key}
            type="button"
            size="sm"
            variant={isOn ? "default" : "outline"}
            onClick={() => toggle(member.key)}
            disabled={disabled}
            className={cn("h-7 rounded-full px-2.5 text-xs")}
          >
            {member.name}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Tiny inline chip that renders an assignee as a name pill — used by
 * TaskRow and the day-detail sheet.
 */
export function AssigneeChips({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {keys.map((k) => {
        const member = TEAM_MEMBERS.find((m) => m.key === k);
        const label = member?.name ?? k;
        return (
          <span
            key={k}
            className="bg-secondary text-secondary-foreground inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
