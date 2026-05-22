"use client";

import {
  NADINE_COLOR_CLASS,
  nadineProjectInitial,
  type NadineColor,
} from "@/lib/nadine/types";
import { cn } from "@/lib/utils";

export function NadineAvatar({
  project,
  color,
  emoji,
  size = "md",
  className,
}: {
  project: string;
  color: NadineColor;
  emoji: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const palette = NADINE_COLOR_CLASS[color];
  const label = nadineProjectInitial(project, emoji);
  const isEmoji = emoji && emoji.trim().length > 0;

  const dim =
    size === "sm"
      ? "size-6 text-[10px]"
      : size === "lg"
        ? "size-10 text-base"
        : "size-8 text-xs";

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-tight",
        palette.chip,
        dim,
        className,
      )}
    >
      {isEmoji ? (
        <span className="text-base leading-none">{label}</span>
      ) : (
        label
      )}
    </span>
  );
}
