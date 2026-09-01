"use client";

import * as React from "react";

import { SvarGantt } from "@/components/timeliner/svar-gantt";
import { dependencies, groups, holidays, items, timeline } from "@/app/qa/fixture";

export default function Inner() {
  const tl = React.useMemo(() => timeline, []);
  const gr = React.useMemo(() => groups, []);
  const it = React.useMemo(() => items, []);
  const dp = React.useMemo(() => dependencies, []);
  const hd = React.useMemo(() => holidays, []);
  return (
    <div className="p-4">
      <SvarGantt
        timeline={tl} groups={gr} items={it}
        dependencies={dp} holidays={hd} readonly
      />
    </div>
  );
}
