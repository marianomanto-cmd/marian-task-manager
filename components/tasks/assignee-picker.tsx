"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { colorForMemberKey, getMemberByKey, TEAM_MEMBERS } from "@/lib/team/members";
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
        const color = colorForMemberKey(member.key);
        return (
          <Button
            key={member.key}
            type="button"
            size="sm"
            variant={isOn ? "default" : "outline"}
            onClick={() => toggle(member.key)}
            disabled={disabled}
            className={cn(
              "h-7 rounded-full px-2.5 text-xs border",
              isOn ? `${color.barBg} ${color.barText} border-transparent` : "",
            )}
          >
            {member.name}
          </Button>
        );
      })}
    </div>
  );
}

function initialFor(name: string): string {
  return name.charAt(0).toUpperCase();
}

/**
 * Compact overlapping circles, Linear/Trello-style. Use this in task cards
 * and rows. Caps at 4 visible; overflow shown as +N.
 */
export function AssigneeAvatars({
  keys,
  size = "sm",
  max = 4,
}: {
  keys: readonly string[];
  size?: "xs" | "sm" | "md";
  max?: number;
}) {
  if (keys.length === 0) return null;

  const sizeClass =
    size === "xs"
      ? "size-4 text-[8px] ring-2"
      : size === "md"
        ? "size-7 text-[11px] ring-2"
        : "size-5 text-[9px] ring-2";

  const visible = keys.slice(0, max);
  const overflow = keys.length - visible.length;

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((k) => {
        const member = getMemberByKey(k);
        const label = member?.name ?? k;
        const color = colorForMemberKey(k);
        return (
          <span
            key={k}
            title={label}
            className={cn(
              "ring-card inline-flex items-center justify-center rounded-full font-semibold uppercase",
              color.barBg,
              color.barText,
              sizeClass,
            )}
          >
            {initialFor(label)}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          className={cn(
            "ring-card bg-muted text-muted-foreground inline-flex items-center justify-center rounded-full font-semibold",
            sizeClass,
          )}
          title={`${overflow} más`}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Kept for backwards compat: pill-style chips. Prefer AssigneeAvatars in
 * dense surfaces; chips still useful in form summary lines.
 */
export function AssigneeChips({ keys }: { keys: readonly string[] }) {
  if (keys.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {keys.map((k) => {
        const member = getMemberByKey(k);
        const label = member?.name ?? k;
        const color = colorForMemberKey(k);
        return (
          <span
            key={k}
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
              color.chipBg,
            )}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
