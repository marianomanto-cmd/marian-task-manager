"use client";

import {
  PROJECT_COLOR_CLASS,
  projectInitial,
  type ProjectColor,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

export function ProjectAvatar({
  project,
  color,
  emoji,
  size = "md",
  className,
}: {
  project: string;
  color: ProjectColor;
  emoji: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const palette = PROJECT_COLOR_CLASS[color];
  const label = projectInitial(project, emoji);
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
