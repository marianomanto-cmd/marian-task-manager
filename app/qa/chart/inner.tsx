"use client";

import * as React from "react";

import { SvarGantt } from "@/components/timeliner/svar-gantt";
import {
  dependencies as seedDeps,
  groups,
  holidays,
  items as seedItems,
  timeline,
} from "@/app/qa/fixture";
import type { TimelineDependency, TimelineItem } from "@/lib/timeliner/types";

type Ev = { kind: string; detail: string };
declare global {
  interface Window { __qa?: Ev[] }
}

/**
 * QA harness. Mirrors what `timeliner-board.tsx` does around the chart: the
 * handlers patch a cached snapshot, and the chart is keyed so switching away
 * and back rebuilds it from that snapshot — the path where a saved drag used
 * to silently revert.
 */
export default function Inner() {
  const [events, setEvents] = React.useState<Ev[]>([]);
  const [items, setItems] = React.useState<TimelineItem[]>(seedItems);
  const [deps, setDeps] = React.useState<TimelineDependency[]>(seedDeps);
  const [epoch, setEpoch] = React.useState(0);
  const [away, setAway] = React.useState(false);

  const push = React.useCallback((kind: string, detail: unknown) => {
    setEvents((prev) => {
      const next = [...prev, { kind, detail: JSON.stringify(detail) }];
      window.__qa = next;
      return next;
    });
  }, []);

  const handlers = React.useMemo(
    () => ({
      onDates: (changes: { id: string; start_date: string; end_date: string }[]) => {
        push("dates", changes);
        const byId = new Map(changes.map((c) => [c.id, c]));
        setItems((prev) =>
          prev.map((it) => {
            const c = byId.get(it.id);
            return c ? { ...it, start_date: c.start_date, end_date: c.end_date } : it;
          }),
        );
      },
      onAddLink: (l: { from_item_id: string; to_item_id: string; dep_type: string; lag_days: number }) => {
        push("add-link", l);
        setDeps((prev) => [
          ...prev,
          { id: `new-${prev.length}`, timeline_id: "t", ...l } as TimelineDependency,
        ]);
      },
      onUpdateLink: (id: string, p: unknown) => push("update-link", { id, ...(p as object) }),
      onDeleteLink: (id: string) => {
        push("delete-link", { id });
        setDeps((prev) => prev.filter((d) => d.id !== id));
      },
      onDeleteItem: (id: string) => push("delete-item", { id }),
      onEditItem: (it: { id: string; title: string }) => push("edit-item", { id: it.id, title: it.title }),
      onReorder: (rows: { id: string; position: number; group_id: string | null }[]) => {
        push("reorder", rows.slice(0, 4));
        const byId = new Map(rows.map((r) => [r.id, r]));
        setItems((prev) =>
          prev.map((it) => {
            const r = byId.get(it.id);
            return r ? { ...it, position: r.position, group_id: r.group_id } : it;
          }),
        );
      },
    }),
    [push],
  );

  const tl = React.useMemo(() => timeline, []);
  const gr = React.useMemo(() => groups, []);
  const hd = React.useMemo(() => holidays, []);

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center gap-3">
        <button
          id="qa-away"
          type="button"
          className="rounded border px-3 py-1 text-xs"
          onClick={() => {
            // Leave and come straight back, the way switching tabs does.
            setAway(true);
            setEpoch((n) => n + 1);
            setTimeout(() => setAway(false), 120);
          }}
        >
          Ir y volver
        </button>
        <span id="qa-dates" className="text-[11px]">
          {items.map((i) => `${i.id}=${i.start_date}..${i.end_date}`).join(" ")}
        </span>
      </div>
      <pre id="qa-log" className="mb-2 max-h-20 overflow-auto text-[11px]">
        {events.length === 0 ? "(sin eventos)" : events.map((e, i) => `${i + 1}. ${e.kind} ${e.detail}`).join("\n")}
      </pre>
      {away ? (
        <div id="qa-off" style={{ height: 400 }} />
      ) : (
        <SvarGantt
          key={`t:${epoch}`}
          timeline={tl}
          groups={gr}
          items={items}
          dependencies={deps}
          holidays={hd}
          handlers={handlers}
        />
      )}
    </div>
  );
}
