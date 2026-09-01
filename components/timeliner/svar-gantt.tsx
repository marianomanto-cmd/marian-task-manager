"use client";

import dynamic from "next/dynamic";

import { ROW_H } from "@/lib/timeliner/grid";

/**
 * Client-only boundary around the SVAR chart.
 *
 * SVAR reads its state through `useSyncExternalStore` with no SSR-cached
 * snapshot, so server-rendering it warns and then mismatches on hydration.
 * The chart is an interactive editor behind a login — nothing to crawl, no
 * first paint worth server-rendering — so keeping it off the server is the
 * correct shape, and it also keeps the library out of the server bundle.
 */
const SvarGanttInner = dynamic(
  () => import("@/components/timeliner/svar-gantt-inner"),
  {
    ssr: false,
    loading: () => (
      <div
        className="bg-card text-muted-foreground flex items-center justify-center rounded-xl border text-sm"
        style={{ height: ROW_H * 8 }}
      >
        Cargando el cronograma…
      </div>
    ),
  },
);

export { SvarGanttInner as SvarGantt };
export type { SvarGanttHandlers } from "@/components/timeliner/svar-gantt-inner";
