"use client";

import * as React from "react";

import { MasterView } from "@/components/timeliner/master-view";
import { holidays, items } from "@/app/qa/fixture";
import type { Timeline } from "@/lib/timeliner/types";

const timelines: Timeline[] = [
  { id: "t", name: "Colombia Positioning", position: 0, weekends_enabled: true, holiday_countries: ["AR"], share_token: null },
  { id: "t2", name: "Puerto Rico Creative", position: 1, weekends_enabled: true, holiday_countries: [], share_token: null },
];
const all = [...items, ...items.map((i) => ({ ...i, id: `b${i.id}`, timeline_id: "t2" }))];

export default function Inner() {
  const [opened, setOpened] = React.useState("(ninguno)");
  return (
    <div className="p-4">
      <span id="qa-opened" className="text-xs">{opened}</span>
      <MasterView timelines={timelines} items={all} holidays={holidays} onOpenTimeline={setOpened} />
    </div>
  );
}
