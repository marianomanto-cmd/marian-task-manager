import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import type {
  TimelineDependency,
  TimelineItem,
} from "@/lib/timeliner/types";

/**
 * The scheduling engine behind dependency arrows: when one item moves or is
 * stretched, this works out where everything downstream lands.
 *
 * The rule is **slack preservation**. Every link implies an earliest allowed
 * position for its successor; the distance between that and where the
 * successor actually sits is its slack, and slack is what the planner
 * deliberately drew. So a successor shifts by exactly as much as its
 * constraint shifted — no more, no less:
 *
 *     shift(successor) = max over its incoming links of Δ(constraint)
 *
 * A chain drawn tight stays tight and follows a drag day for day; a chain
 * drawn with three days of air keeps its three days. Dragging a predecessor
 * *earlier* pulls its successors back too, but only as far as their other
 * predecessors allow — that's what the `max` is doing.
 *
 * Everything here is pure and date-only (YYYY-MM-DD), so the board can preview
 * a cascade mid-drag and the server can replay the same result on commit.
 */

export type DateChange = { id: string; start_date: string; end_date: string };

/** Which of the predecessor's ends a link type hangs off. */
function predecessorAnchor(depType: string): "start" | "end" {
  return depType === "SS" || depType === "SF" ? "start" : "end";
}

function anchorDate(item: DateChange, anchor: "start" | "end"): string {
  return anchor === "start" ? item.start_date : item.end_date;
}

/**
 * Kahn's algorithm over the dependency graph. Items caught in a cycle come
 * back in `cyclic` and are left where they are: a cycle has no consistent
 * schedule, and silently shuffling those rows would be worse than not moving
 * them. Links are rejected before they can form a cycle (see `wouldCycle`),
 * so this is a backstop for data that predates that check.
 */
function topologicalOrder(
  itemIds: readonly string[],
  deps: readonly TimelineDependency[],
): { order: string[]; cyclic: Set<string> } {
  const present = new Set(itemIds);
  const edges = deps.filter(
    (d) => present.has(d.from_item_id) && present.has(d.to_item_id),
  );

  const indegree = new Map<string, number>(itemIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const d of edges) {
    indegree.set(d.to_item_id, (indegree.get(d.to_item_id) ?? 0) + 1);
    const list = outgoing.get(d.from_item_id);
    if (list) list.push(d.to_item_id);
    else outgoing.set(d.from_item_id, [d.to_item_id]);
  }

  const queue = itemIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  const cyclic = new Set<string>();
  if (order.length !== itemIds.length) {
    const settled = new Set(order);
    for (const id of itemIds) if (!settled.has(id)) cyclic.add(id);
  }
  return { order, cyclic };
}

/**
 * Apply a set of hand-made edits and let the dependency graph carry them
 * downstream. `edits` are the rows the user actually dragged — they are taken
 * as given and never second-guessed. The return value is every *other* row
 * whose dates moved as a result, ready to be written or previewed.
 */
export function cascadeSchedule(
  items: readonly TimelineItem[],
  deps: readonly TimelineDependency[],
  edits: readonly DateChange[],
): DateChange[] {
  if (edits.length === 0) return [];

  const original = new Map<string, DateChange>(
    items.map((i) => [
      i.id,
      { id: i.id, start_date: i.start_date, end_date: i.end_date },
    ]),
  );
  const current = new Map<string, DateChange>(original);

  const pinned = new Set<string>();
  for (const e of edits) {
    if (!current.has(e.id)) continue;
    current.set(e.id, { ...e });
    pinned.add(e.id);
  }

  const incoming = new Map<string, TimelineDependency[]>();
  for (const d of deps) {
    if (!current.has(d.from_item_id) || !current.has(d.to_item_id)) continue;
    const list = incoming.get(d.to_item_id);
    if (list) list.push(d);
    else incoming.set(d.to_item_id, [d]);
  }

  const { order, cyclic } = topologicalOrder([...current.keys()], deps);

  for (const id of order) {
    // A row the user just dragged stays exactly where they dropped it.
    if (pinned.has(id)) continue;
    const links = incoming.get(id);
    if (!links || links.length === 0) continue;

    let shift: number | null = null;
    for (const link of links) {
      if (cyclic.has(link.from_item_id)) continue;
      const anchor = predecessorAnchor(link.dep_type);
      const before = anchorDate(original.get(link.from_item_id)!, anchor);
      const after = anchorDate(current.get(link.from_item_id)!, anchor);
      const delta = differenceInCalendarDays(parseISO(after), parseISO(before));
      shift = shift === null ? delta : Math.max(shift, delta);
    }
    if (shift === null || shift === 0) continue;

    const row = current.get(id)!;
    current.set(id, {
      id,
      start_date: format(addDays(parseISO(row.start_date), shift), "yyyy-MM-dd"),
      end_date: format(addDays(parseISO(row.end_date), shift), "yyyy-MM-dd"),
    });
  }

  const out: DateChange[] = [];
  for (const [id, row] of current) {
    if (pinned.has(id)) continue;
    const before = original.get(id)!;
    if (row.start_date !== before.start_date || row.end_date !== before.end_date)
      out.push(row);
  }
  return out;
}

/**
 * Would adding `from → to` close a loop? Walking forward from `to` and looking
 * for `from` answers it, and is what keeps `cascadeSchedule` solvable.
 */
export function wouldCycle(
  deps: readonly TimelineDependency[],
  fromItemId: string,
  toItemId: string,
): boolean {
  if (fromItemId === toItemId) return true;
  const outgoing = new Map<string, string[]>();
  for (const d of deps) {
    const list = outgoing.get(d.from_item_id);
    if (list) list.push(d.to_item_id);
    else outgoing.set(d.from_item_id, [d.to_item_id]);
  }
  const seen = new Set<string>([toItemId]);
  const stack = [toItemId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === fromItemId) return true;
    for (const next of outgoing.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return false;
}
