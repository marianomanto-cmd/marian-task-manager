import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import type {
  TimelineDependency,
  TimelineDependencyType,
  TimelineGroup,
  TimelineItem,
} from "@/lib/timeliner/types";

/**
 * Translation layer between our rows and SVAR Gantt's model.
 *
 * Two mismatches are worth stating out loud, because every date bug in a Gantt
 * lives in one of them:
 *
 * 1. **`end` is exclusive in SVAR, inclusive for us.** A task drawn from the
 *    1st to the 5th is `end_date = 2026-09-05` here and `end = 2026-09-06`
 *    there. Every conversion below adds or removes that day.
 * 2. **Groups are rows for us, summary tasks for SVAR.** Ours are plain
 *    sections an item belongs to; SVAR nests children under a parent. Group
 *    ids are prefixed so they can never collide with an item id.
 *
 * Everything here is pure so it can be tested without mounting a chart.
 */

/** SVAR names a link by the endpoints it joins; we name it by the classic code. */
export const LINK_TYPE_TO_SVAR: Record<TimelineDependencyType, string> = {
  FS: "e2s",
  SS: "s2s",
  FF: "e2e",
  SF: "s2e",
};

const SVAR_TO_LINK_TYPE: Record<string, TimelineDependencyType> = {
  e2s: "FS",
  s2s: "SS",
  e2e: "FF",
  s2e: "SF",
};

export function toDependencyType(svarType: string): TimelineDependencyType {
  return SVAR_TO_LINK_TYPE[svarType] ?? "FS";
}

/** Group rows share an id space with items in SVAR; the prefix keeps them apart. */
const GROUP_PREFIX = "g:";

export function groupTaskId(groupId: string): string {
  return `${GROUP_PREFIX}${groupId}`;
}

/** The group behind a SVAR parent id, or null for a root-level (ungrouped) row. */
export function groupIdFromParent(parent: unknown): string | null {
  if (typeof parent !== "string" || !parent.startsWith(GROUP_PREFIX)) return null;
  return parent.slice(GROUP_PREFIX.length);
}

export type SvarTask = {
  id: string;
  text: string;
  start: Date;
  end: Date;
  duration?: number;
  type: "task" | "milestone" | "summary";
  parent?: string | number;
  open?: boolean;
  /** Carried through so cells and bar templates can read them back. */
  owner_key?: string | null;
  is_key?: boolean;
};

export type SvarLink = {
  id: string;
  source: string;
  target: string;
  type: string;
  lag: number;
};

/**
 * Items (and their groups) as SVAR tasks, in the board's manual order.
 * Summary rows come first within the list so their children can attach.
 */
export function toSvarTasks(
  items: readonly TimelineItem[],
  groups: readonly TimelineGroup[],
): SvarTask[] {
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  const sortedItems = [...items].sort((a, b) => a.position - b.position);

  const out: SvarTask[] = [];
  for (const g of sortedGroups) {
    const children = sortedItems.filter((i) => i.group_id === g.id);
    // A summary with no children has no span, and SVAR would collapse it to a
    // zero-width bar; give it today so it still renders as an empty section.
    const start = children.length
      ? parseISO(children.reduce((a, c) => (c.start_date < a ? c.start_date : a), children[0].start_date))
      : new Date();
    const end = children.length
      ? addDays(parseISO(children.reduce((a, c) => (c.end_date > a ? c.end_date : a), children[0].end_date)), 1)
      : addDays(new Date(), 1);
    out.push({
      id: groupTaskId(g.id),
      text: g.name,
      start,
      end,
      type: "summary",
      open: true,
    });
  }

  for (const it of sortedItems) {
    out.push(toSvarTask(it));
  }
  return out;
}

export function toSvarTask(item: TimelineItem): SvarTask {
  const start = parseISO(item.start_date);
  const isMilestone = item.kind === "milestone";
  return {
    id: item.id,
    text: item.title,
    start,
    // Exclusive end: a one-day task ends the next morning. Milestones are a
    // point, so start and end coincide and the duration is zero.
    end: isMilestone ? start : addDays(parseISO(item.end_date), 1),
    duration: isMilestone ? 0 : undefined,
    type: isMilestone ? "milestone" : "task",
    parent: item.group_id ? groupTaskId(item.group_id) : 0,
    owner_key: item.owner_key,
    is_key: item.is_key,
  };
}

export function toSvarLinks(deps: readonly TimelineDependency[]): SvarLink[] {
  return deps.map((d) => ({
    id: d.id,
    source: d.from_item_id,
    target: d.to_item_id,
    type: LINK_TYPE_TO_SVAR[d.dep_type],
    lag: d.lag_days,
  }));
}

/**
 * A SVAR task's dates back in our shape. `end` comes back exclusive, so the
 * stored end_date is the day before it; a milestone collapses to its start.
 */
export function fromSvarDates(
  task: { start?: Date; end?: Date; duration?: number },
  kind: "task" | "milestone",
): { start_date: string; end_date: string } | null {
  if (!task.start) return null;
  const start = format(task.start, "yyyy-MM-dd");
  if (kind === "milestone") return { start_date: start, end_date: start };
  if (!task.end) return { start_date: start, end_date: start };
  const inclusiveEnd = addDays(task.end, -1);
  // A drag that collapses the bar can push end before start; clamp rather than
  // write a row the server would reject.
  const end =
    differenceInCalendarDays(inclusiveEnd, task.start) < 0
      ? start
      : format(inclusiveEnd, "yyyy-MM-dd");
  return { start_date: start, end_date: end };
}

/** True when the SVAR id belongs to a group row rather than an item. */
export function isGroupTaskId(id: unknown): boolean {
  return typeof id === "string" && id.startsWith(GROUP_PREFIX);
}
