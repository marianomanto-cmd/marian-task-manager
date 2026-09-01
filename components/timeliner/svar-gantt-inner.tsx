"use client";

import * as React from "react";
import { addDays, format, isWeekend, parseISO } from "date-fns";
import { useTheme } from "next-themes";
import { Gantt, Willow, WillowDark } from "@svar-ui/react-gantt";

import "@svar-ui/react-gantt/style.css";

import { cascadeSchedule, type DateChange } from "@/lib/timeliner/schedule";
import {
  fromSvarDates,
  isGroupTaskId,
  toDependencyType,
  toSvarLinks,
  toSvarTasks,
} from "@/lib/timeliner/svar-adapter";
import {
  buildHolidayMap,
  firstHolidayColor,
} from "@/lib/timeliner/grid";
import {
  ownerInfo,
  type Holiday,
  type TimelineDependency,
  type TimelineGroup,
  type TimelineItem,
} from "@/lib/timeliner/types";

/**
 * The Gantt itself, on SVAR (`@svar-ui/react-gantt`, MIT).
 *
 * Mounted client-only by `svar-gantt.tsx`: SVAR reads its state through
 * `useSyncExternalStore` without an SSR-cached snapshot, so anything rendered
 * on the server mismatches on hydration. It is an editor behind a login, so
 * there was never anything to server-render.
 *
 * Once mounted, SVAR owns the interactive state — that is what makes drag,
 * resize and link-drawing feel immediate. Every change it reports is written
 * through to Postgres by the caller's mutations, so the chart is the source of
 * truth for the gesture and the database is the source of truth for the plan.
 * The component is keyed on the timeline id by its parent, so switching tabs
 * rebuilds it from fresh server data.
 *
 * **Scheduling is ours, not SVAR's.** Its `schedule: {auto: true}` enforces a
 * link by *rejecting* the drag — you pull a bar, it springs back — which is
 * the opposite of what planning a campaign needs. So auto-scheduling stays
 * off (a drag always lands where you dropped it) and `cascadeSchedule` works
 * out where the downstream tasks go, preserving the slack each link was drawn
 * with. The results are pushed back into the chart through `api.exec` so the
 * whole chain moves in one gesture, and saved as a single batch.
 */

export type SvarGanttHandlers = {
  /** The dragged row plus every row the dependency graph pushed with it. */
  onDates: (changes: DateChange[]) => void;
  onAddLink: (link: {
    from_item_id: string;
    to_item_id: string;
    dep_type: string;
    lag_days: number;
  }) => void;
  onUpdateLink: (id: string, patch: { dep_type: string; lag_days: number }) => void;
  onDeleteLink: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onEditItem: (item: TimelineItem) => void;
  onMoveItem: (id: string, groupId: string | null, position: number) => void;
};

export default function SvarGanttInner({
  timeline,
  groups,
  items,
  dependencies,
  holidays,
  readonly = false,
  handlers,
}: {
  timeline: { weekends_enabled: boolean; holiday_countries: string[] };
  groups: TimelineGroup[];
  items: TimelineItem[];
  dependencies: TimelineDependency[];
  holidays: Holiday[];
  readonly?: boolean;
  handlers?: SvarGanttHandlers;
}) {
  const { resolvedTheme } = useTheme();
  const Theme = resolvedTheme === "dark" ? WillowDark : Willow;

  // SVAR's themes inject a stylesheet from cdn.svar.dev for their icon font.
  // We draw the handful of glyphs the chart uses ourselves (see globals.css),
  // so drop the tag rather than let every page load reach a third party.
  React.useEffect(() => {
    const drop = () =>
      document
        .querySelectorAll('link[href^="https://cdn.svar.dev"]')
        .forEach((el) => el.remove());
    drop();
    const observer = new MutationObserver(drop);
    observer.observe(document.head, { childList: true });
    return () => observer.disconnect();
  }, []);

  const itemsById = React.useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  /**
   * Live values for the callbacks below.
   *
   * SVAR rebuilds its internal config — and re-reads `tasks` — whenever the
   * config props change identity. A background refetch hands us new arrays
   * even when nothing was edited, so anything derived from them must not reach
   * the chart as a new prop, or the plan resets under the planner's hands
   * mid-edit. Reading through refs keeps `columns`, `taskTemplate` and the
   * event handlers referentially stable for the life of the mount.
   */
  const liveRef = React.useRef({ itemsById, dependencies, handlers });
  React.useEffect(() => {
    liveRef.current = { itemsById, dependencies, handlers };
  }, [itemsById, dependencies, handlers]);

  // SVAR's api, captured on mount: `exec` is how the cascade is written back
  // into the chart and `getTask` is how the current plan is read out of it.
  const apiRef = React.useRef<{
    exec: (action: string, params: unknown) => Promise<unknown>;
    getTask: (id: string) => { start?: Date; end?: Date } | undefined;
  } | null>(null);

  // Rows this component just wrote. `exec("update-task")` comes back through
  // `onUpdateTask` like any other edit, and re-cascading off our own echo
  // would walk the chain twice.
  const echoRef = React.useRef(new Map<string, string>());

  // Built once per mount: SVAR takes ownership of the data from here on.
  const initialTasks = React.useMemo(
    () => toSvarTasks(items, groups),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialLinks = React.useMemo(
    () => toSvarLinks(dependencies),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );


  // Keyed on the contents, not the array identity: a parent passing a fresh
  // `holiday_countries` array on every render would otherwise give SVAR a new
  // config object, and it re-initialises from `tasks` when its config changes
  // — throwing away the drag in progress.
  const countryKey = timeline.holiday_countries.join(",");
  const holidayByDate = React.useMemo(
    () => buildHolidayMap(holidays, countryKey ? countryKey.split(",") : []),
    [holidays, countryKey],
  );

  /** Weekend and holiday tints, the same palette the rest of the app uses. */
  const highlightTime = React.useCallback(
    (date: Date, unit: string) => {
      if (unit !== "day") return "";
      const entry = holidayByDate.get(format(date, "yyyy-MM-dd"));
      if (entry) {
        const country = firstHolidayColor(entry.countries);
        if (country) return `tl-holiday tl-holiday-${country.code}`;
      }
      if (timeline.weekends_enabled && isWeekend(date)) return "tl-weekend";
      return "";
    },
    [holidayByDate, timeline.weekends_enabled],
  );

  const markers = React.useMemo(
    () => [{ start: new Date(), text: "Hoy", css: "tl-today" }],
    [],
  );

  /**
   * Our mirror of the plan, as it stood *before* the drag being handled.
   *
   * It can't be read back off the chart: by the time the drop event arrives
   * SVAR has already applied the move, so the engine would be comparing the
   * new dates against themselves and every shift would come out as zero. And
   * it can't be the `items` prop either, which is frozen at mount and goes
   * stale after the first drag. So we keep the baseline ourselves and advance
   * it by exactly what we apply.
   */
  const planRef = React.useRef<Map<string, TimelineItem>>(
    new Map(items.map((i) => [i.id, i])),
  );

  const baseline = React.useCallback(
    (): TimelineItem[] => [...planRef.current.values()],
    [],
  );

  /** Move the baseline forward once a batch has been applied to the chart. */
  const advanceBaseline = React.useCallback((changes: readonly DateChange[]) => {
    for (const c of changes) {
      const prev = planRef.current.get(c.id);
      if (!prev) continue;
      planRef.current.set(c.id, {
        ...prev,
        start_date: c.start_date,
        end_date: c.end_date,
      });
    }
  }, []);

  /** Owner colour on the bar, driven by a class the CSS paints. */
  const taskTemplate = React.useCallback(
    ({ data }: { data: { id?: unknown; text?: string; type?: string } }) => {
      const item =
        typeof data.id === "string"
          ? liveRef.current.itemsById.get(data.id)
          : undefined;
      const info = ownerInfo(item?.owner_key ?? null);
      const owner = `tl-owner-${info?.code ?? "none"}`;
      // A milestone's diamond is SVAR's own `.wx-content`, a rotated sibling of
      // whatever the template renders — painting a background here would just
      // box the diamond in a square. So the template stays transparent and only
      // carries the owner class and the label; the CSS reaches back to the
      // diamond with `:has()` and tints that instead.
      if ((data.type ?? item?.kind) === "milestone") {
        return (
          <div className={`tl-milestone ${owner}`}>
            <span className="tl-milestone-label">
              {item?.is_key ? "★ " : ""}
              {data.text}
            </span>
          </div>
        );
      }
      return (
        <div className={`tl-bar ${owner}`}>
          {item?.is_key ? <span className="tl-bar-star">★</span> : null}
          <span className="tl-bar-text">{data.text}</span>
        </div>
      );
    },
    [],
  );

  const columns = React.useMemo(
    () => [
      { id: "text", header: "Tarea / hito", flexgrow: 2, width: 190 },
      {
        id: "owner",
        header: "Owner",
        width: 96,
        template: (_v: unknown, task: { id?: unknown }) => {
          const item =
            typeof task.id === "string"
              ? liveRef.current.itemsById.get(task.id)
              : undefined;
          return ownerInfo(item?.owner_key ?? null)?.label ?? "";
        },
      },
      {
        id: "start",
        header: "Inicio",
        width: 92,
        align: "center" as const,
        // The default renders "04-09-2026", which wraps in this width.
        template: (value: unknown) =>
          value instanceof Date ? format(value, "d MMM") : "",
      },
      { id: "duration", header: "Días", width: 52, align: "center" as const },
    ],
    [],
  );

  /**
   * Persist whatever SVAR reports, translated back into our rows. The shape is
   * the same whether or not the chart is editable — a read-only chart simply
   * never fires them — so the props object keeps one type.
   */
  const events = React.useMemo(() => {
    const live = () => (readonly ? undefined : liveRef.current.handlers);
    return {
      // Runtime prop names are `on` + PascalCase of the action ("update-task"
      // → onUpdateTask). The published types say otherwise, but the component's
      // catch-all `on${string}` index signature makes a wrong name type-check
      // and silently never fire — so these spellings are load-bearing.
      onUpdateTask: (ev: {
        id: unknown;
        task: { start?: Date; end?: Date; duration?: number };
        inProgress?: boolean;
      }) => {
        // Fires continuously while a bar is dragged; only the drop is a write.
        const h = live();
        if (!h || ev.inProgress) return;
        if (typeof ev.id !== "string" || isGroupTaskId(ev.id)) return;
        const item = liveRef.current.itemsById.get(ev.id);
        if (!item) return;
        const dates = fromSvarDates(ev.task, item.kind);
        if (!dates) return;

        // Our own write coming back round; the chain already moved for it.
        const echo = echoRef.current.get(ev.id);
        const stamp = `${dates.start_date}|${dates.end_date}`;
        if (echo === stamp) {
          echoRef.current.delete(ev.id);
          return;
        }
        const known = planRef.current.get(ev.id) ?? item;
        if (
          dates.start_date === known.start_date &&
          dates.end_date === known.end_date
        )
          return;

        const moved: DateChange = { id: ev.id, ...dates };
        const followers = cascadeSchedule(
          baseline(),
          liveRef.current.dependencies,
          [moved],
        );

        // Show the chain move in the same gesture, then save it in one batch.
        const api = apiRef.current;
        if (api) {
          for (const f of followers) {
            const target = liveRef.current.itemsById.get(f.id);
            if (!target) continue;
            echoRef.current.set(f.id, `${f.start_date}|${f.end_date}`);
            void api.exec("update-task", {
              id: f.id,
              task: {
                start: parseISO(f.start_date),
                end:
                  target.kind === "milestone"
                    ? parseISO(f.start_date)
                    : addDays(parseISO(f.end_date), 1),
              },
            });
          }
        }
        const batch = [moved, ...followers];
        advanceBaseline(batch);
        h.onDates(batch);
      },
      onAddLink: (ev: {
        link: { source: unknown; target: unknown; type: string; lag?: number };
      }) => {
        const h = live();
        if (!h) return;
        const { source, target, type, lag } = ev.link;
        if (typeof source !== "string" || typeof target !== "string") return;
        if (isGroupTaskId(source) || isGroupTaskId(target)) return;
        h.onAddLink({
          from_item_id: source,
          to_item_id: target,
          dep_type: toDependencyType(type),
          lag_days: lag ?? 0,
        });
      },
      onUpdateLink: (ev: {
        id: unknown;
        link: { type?: string; lag?: number };
      }) => {
        const h = live();
        if (!h || typeof ev.id !== "string") return;
        h.onUpdateLink(ev.id, {
          dep_type: toDependencyType(ev.link.type ?? "e2s"),
          lag_days: ev.link.lag ?? 0,
        });
      },
      onDeleteLink: (ev: { id: unknown }) => {
        const h = live();
        if (h && typeof ev.id === "string") h.onDeleteLink(ev.id);
      },
      onDeleteTask: (ev: { id: unknown }) => {
        const h = live();
        if (h && typeof ev.id === "string" && !isGroupTaskId(ev.id))
          h.onDeleteItem(ev.id);
      },
      onMoveTask: (ev: {
        id: unknown;
        target?: unknown;
        inProgress?: boolean;
      }) => {
        const h = live();
        if (!h || ev.inProgress) return;
        if (typeof ev.id !== "string" || isGroupTaskId(ev.id)) return;
        const item = liveRef.current.itemsById.get(ev.id);
        if (!item) return;
        h.onMoveItem(ev.id, item.group_id, item.position);
      },
      onShowEditor: (ev: { id: unknown }) => {
        // Our own editor owns owner, group and the MASTER star.
        const h = live();
        if (!h || typeof ev.id !== "string") return;
        const item = liveRef.current.itemsById.get(ev.id);
        if (item) h.onEditItem(item);
      },
    };
  }, [readonly, baseline, advanceBaseline]);

  return (
    <div className="tl-gantt bg-card overflow-hidden rounded-xl border">
      {/* fonts={false}: no Open Sans / Roboto fetch from svar's CDN either. */}
      <Theme fonts={false}>
        <Gantt
          tasks={initialTasks}
          links={initialLinks}
          columns={columns}
          taskTemplate={taskTemplate}
          highlightTime={highlightTime}
          markers={markers}
          init={(api) => {
            apiRef.current = api as unknown as typeof apiRef.current;
          }}
          readonly={readonly}
          cellHeight={38}
          scaleHeight={34}
          // A day at SVAR's default 100px puts barely a fortnight on screen;
          // 34 matches the density Timeliner had, and zoom covers the rest.
          cellWidth={34}
          zoom
          {...events}
        />
      </Theme>
    </div>
  );
}
