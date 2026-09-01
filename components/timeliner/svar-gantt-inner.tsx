"use client";

import * as React from "react";
import { addDays, format, isWeekend, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useTheme } from "next-themes";
import { Gantt, Willow, WillowDark } from "@svar-ui/react-gantt";

import "@svar-ui/react-gantt/style.css";

import { cascadeSchedule, type DateChange } from "@/lib/timeliner/schedule";
import {
  fromSvarDates,
  groupIdFromParent,
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
  /** The full vertical order after a row was dragged up or down. */
  onReorder: (
    rows: { id: string; group_id: string | null; position: number }[],
  ) => void;
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
    serialize: (config?: { data?: string }) => unknown;
  } | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);

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

  /**
   * Drag a link out of a bar tip.
   *
   * SVAR only knows how to build a link from two clicks — one on the source
   * tip, one on the target's — which works but is not what a Gantt is expected
   * to do. This adds the drag on top: press a tip, release over another bar,
   * and the link is made. The pair of tips involved is the link type, exactly
   * as in the two-click flow (`e2s` finish→start, `s2s`, `e2e`, `s2e`).
   *
   * Nothing here interferes with the click flow. A press and release on the
   * same tip is a click, the target resolves to the source itself, we bail,
   * and SVAR handles it as before.
   */
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || readonly) return;

    /** SVAR stores ids on the bar prefixed with a colon to keep them DOM-safe. */
    const idOf = (el: HTMLElement | null | undefined) => {
      const raw = el?.dataset.taskId;
      if (!raw) return null;
      return raw.startsWith(":") ? raw.slice(1) : raw;
    };

    let source: { id: string; start: boolean } | null = null;

    function onDown(ev: PointerEvent) {
      const tip = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>(".wx-link");
      if (!tip) return;
      const id = idOf(tip.closest<HTMLElement>("[data-task-id]"));
      if (!id) return;
      source = { id, start: tip.classList.contains("wx-left") };
    }

    function onUp(ev: PointerEvent) {
      const from = source;
      source = null;
      if (!from) return;

      const under = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-task-id]");
      const targetId = idOf(under);
      // Released on nothing, or back on the source: leave it to SVAR's click.
      if (!targetId || targetId === from.id) return;

      // Dropped straight on a tip? Use it. Otherwise the half of the bar
      // decides, the way every other Gantt behaves.
      const tip = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>(".wx-link");
      let toStart: boolean;
      if (tip && idOf(tip.closest<HTMLElement>("[data-task-id]")) === targetId) {
        toStart = tip.classList.contains("wx-left");
      } else {
        const rect = under!.getBoundingClientRect();
        toStart = ev.clientX < rect.left + rect.width / 2;
      }

      void apiRef.current?.exec("add-link", {
        link: {
          source: from.id,
          target: targetId,
          type: `${from.start ? "s" : "e"}2${toStart ? "s" : "e"}`,
        },
      });
    }

    root.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [readonly]);

  /**
   * Weekend and holiday tints, in the same palette as the rest of the app.
   *
   * `wx-weekend` is load-bearing and not just a name: it is SVAR's own class
   * for a highlighted column, and it carries the rule that stretches the
   * column down the full height of the chart. Drop it and the band collapses
   * to nothing — the ruler stays tinted while the grid behind the bars goes
   * blank. So every tinted day keeps it for the geometry, and our own class
   * rides alongside to set the colour.
   */
  const highlightTime = React.useCallback(
    (date: Date, unit: string) => {
      if (unit !== "day") return "";
      const entry = holidayByDate.get(format(date, "yyyy-MM-dd"));
      if (entry) {
        const country = firstHolidayColor(entry.countries);
        if (country) return `wx-weekend tl-holiday-${country.code}`;
      }
      if (timeline.weekends_enabled && isWeekend(date)) return "wx-weekend tl-weekend";
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

  /**
   * One column, not a spreadsheet.
   *
   * SVAR's default grid is a table of Name / Start / Duration, which turns the
   * left of the chart into a second UI competing with the bars. Timeliner only
   * ever had a list of what the rows are, so that is what stays: the title,
   * with the owner and the dates underneath in small type.
   */
  const NameCell = React.useCallback(
    ({ row }: { row: { id?: unknown; text?: string } }) => {
      const item =
        typeof row.id === "string" ? liveRef.current.itemsById.get(row.id) : undefined;
      if (!item) {
        return <span className="tl-name-title">{row.text}</span>;
      }
      const owner = ownerInfo(item.owner_key)?.label ?? "Sin owner";
      const start = format(parseISO(item.start_date), "d MMM", { locale: es });
      const span =
        item.kind === "milestone"
          ? start
          : `${start} – ${format(parseISO(item.end_date), "d MMM", { locale: es })}`;
      return (
        <span className="tl-name">
          <span className="tl-name-title">
            {item.is_key ? <span className="tl-name-star">★</span> : null}
            {item.title}
          </span>
          <span className="tl-name-meta">
            {owner} · {span}
          </span>
        </span>
      );
    },
    [],
  );

  const columns = React.useMemo(
    () => [
      { id: "text", header: "Tarea / hito", width: 280, flexgrow: 1, cell: NameCell },
    ],
    [NameCell],
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
        const api = apiRef.current;
        if (!api) return;
        // A move rewrites the whole order, not just the dragged row, so the
        // stored positions come from the tree SVAR now holds.
        const ordered = api.serialize({ data: "tasks" });
        if (!Array.isArray(ordered)) return;
        const rows = (ordered as { id?: unknown; parent?: unknown }[])
          .filter((t) => typeof t.id === "string" && !isGroupTaskId(t.id))
          .map((t, index) => ({
            id: t.id as string,
            group_id: groupIdFromParent(t.parent),
            position: index,
          }));
        if (rows.length > 0) h.onReorder(rows);
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
    <div
      ref={rootRef}
      className="tl-gantt bg-card overflow-hidden rounded-xl border"
    >
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
