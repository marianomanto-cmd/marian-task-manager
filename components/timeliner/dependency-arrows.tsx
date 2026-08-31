"use client";

import * as React from "react";

import {
  LEFT_W,
  buildArrow,
  buildDraftArrow,
  itemAnchors,
  type ItemAnchors,
} from "@/lib/timeliner/grid";
import { isViolated } from "@/lib/timeliner/schedule";
import type {
  DependencyEndpoint,
  TimelineDependency,
  TimelineItem,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/** The link being dragged out of a tip, in grid coordinates. */
export type DraftLink = {
  fromId: string;
  fromSide: DependencyEndpoint;
  x: number;
  y: number;
  /** Bar currently under the cursor, if it can take the drop. */
  targetId: string | null;
};

/** Which tip of the predecessor a link type hangs off. */
function fromSideOf(depType: string): DependencyEndpoint {
  return depType === "SS" || depType === "SF" ? "start" : "end";
}
function toSideOf(depType: string): DependencyEndpoint {
  return depType === "FS" || depType === "SS" ? "start" : "end";
}

/**
 * The arrows layer, drawn over the grid in both the editable board and the
 * read-only share view. It sits above the bars so a link is never buried, but
 * ignores the pointer except on the arrows themselves — clicking one opens its
 * editor, everywhere else the click falls through to the bar underneath.
 *
 * A link the plan has drifted past (the successor now starts before its
 * predecessor allows) is drawn in red: nothing is auto-corrected behind the
 * planner's back, they just get told.
 */
export function DependencyArrows({
  items,
  dependencies,
  topById,
  rangeStart,
  gridWidth,
  height,
  selectedId = null,
  onSelect,
  draft = null,
}: {
  /** Items with any in-flight drag preview already applied. */
  items: readonly TimelineItem[];
  dependencies: readonly TimelineDependency[];
  topById: Map<string, number>;
  rangeStart: Date;
  gridWidth: number;
  height: number;
  selectedId?: string | null;
  /** Omit to render read-only: no hit areas, no cursor. */
  onSelect?: (dependency: TimelineDependency) => void;
  draft?: DraftLink | null;
}) {
  const anchorsById = React.useMemo(() => {
    const m = new Map<string, ItemAnchors>();
    for (const it of items) {
      const top = topById.get(it.id);
      if (top === undefined) continue;
      m.set(it.id, itemAnchors(it, rangeStart, top));
    }
    return m;
  }, [items, topById, rangeStart]);

  const itemsById = React.useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  const arrows = React.useMemo(
    () =>
      dependencies.flatMap((dep) => {
        const from = anchorsById.get(dep.from_item_id);
        const to = anchorsById.get(dep.to_item_id);
        const fromItem = itemsById.get(dep.from_item_id);
        const toItem = itemsById.get(dep.to_item_id);
        if (!from || !to || !fromItem || !toItem) return [];
        return [
          {
            dep,
            violated: isViolated(dep, fromItem, toItem),
            ...buildArrow(from, fromSideOf(dep.dep_type), to, toSideOf(dep.dep_type)),
          },
        ];
      }),
    [dependencies, anchorsById, itemsById],
  );

  const draftPath = React.useMemo(() => {
    if (!draft) return null;
    const from = anchorsById.get(draft.fromId);
    if (!from) return null;
    return buildDraftArrow(from, draft.fromSide, draft.x, draft.y);
  }, [draft, anchorsById]);

  if (arrows.length === 0 && !draftPath) return null;

  return (
    <svg
      width={gridWidth}
      height={height}
      className="pointer-events-none absolute top-0"
      style={{ left: LEFT_W, zIndex: 12 }}
      aria-hidden
    >
      {arrows.map(({ dep, violated, path, head }) => {
        const selected = selectedId === dep.id;
        return (
          <g
            key={dep.id}
            className={cn(
              "transition-colors",
              violated
                ? "text-destructive"
                : selected
                  ? "text-primary"
                  : "text-foreground/40",
            )}
          >
            {onSelect ? (
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: "stroke", cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(dep);
                }}
              />
            ) : null}
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={selected || violated ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={violated ? "5 3" : undefined}
            />
            <path d={head} fill="currentColor" stroke="none" />
          </g>
        );
      })}
      {draftPath ? (
        <g className="text-primary">
          <path
            d={draftPath}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
          <circle cx={draft!.x} cy={draft!.y} r={4} fill="currentColor" />
        </g>
      ) : null}
    </svg>
  );
}
