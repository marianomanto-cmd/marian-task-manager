import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isWeekend,
  parseISO,
} from "date-fns";

import { getMemberByKey } from "@/lib/team/members";
import type {
  Holiday,
  Timeline,
  TimelineDependency,
  TimelineItem,
} from "@/lib/timeliner/types";

/** Hex (no #) per member colorIndex, aligned with the in-app palette order. */
const OWNER_HEX = [
  "0EA5E9", // sky
  "10B981", // emerald
  "F59E0B", // amber
  "F43F5E", // rose
  "8B5CF6", // violet
  "14B8A6", // teal
  "D946EF", // fuchsia
  "F97316", // orange
  "6366F1", // indigo
];

function hexForOwner(key: string | null): string {
  if (!key) return "94A3B8"; // slate-400
  const m = getMemberByKey(key);
  return m ? OWNER_HEX[m.colorIndex % OWNER_HEX.length] : "94A3B8";
}

function durationDays(item: TimelineItem): number {
  return (
    differenceInCalendarDays(parseISO(item.end_date), parseISO(item.start_date)) +
    1
  );
}

export async function exportTimelineXlsx({
  timeline,
  items,
  dependencies = [],
  holidays,
}: {
  timeline: Timeline;
  items: TimelineItem[];
  dependencies?: TimelineDependency[];
  holidays: Holiday[];
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agency Board · Timeliner";
  wb.created = new Date();

  // ─── Sheet 1: task table ────────────────────────────────────────────
  const table = wb.addWorksheet("Tareas");
  table.columns = [
    { header: "Tarea", key: "title", width: 42 },
    { header: "Owner", key: "owner", width: 16 },
    { header: "Inicio", key: "start", width: 13 },
    { header: "Fin", key: "end", width: 13 },
    { header: "Duración (días)", key: "days", width: 16 },
    { header: "Tipo", key: "kind", width: 12 },
    { header: "Depende de", key: "deps", width: 46 },
  ];
  table.getRow(1).font = { bold: true };
  table.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };
  table.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  // Predecessors per item, so the chain drawn on screen survives the export.
  const titleById = new Map(items.map((i) => [i.id, i.title]));
  const predecessorsById = new Map<string, string[]>();
  for (const d of dependencies) {
    const from = titleById.get(d.from_item_id);
    if (!from || !titleById.has(d.to_item_id)) continue;
    const lag =
      d.lag_days === 0
        ? ""
        : ` ${d.lag_days > 0 ? "+" : ""}${d.lag_days}d`;
    const list = predecessorsById.get(d.to_item_id);
    const label = `${from} (${d.dep_type}${lag})`;
    if (list) list.push(label);
    else predecessorsById.set(d.to_item_id, [label]);
  }

  for (const it of items) {
    const row = table.addRow({
      title: it.title,
      owner: getMemberByKey(it.owner_key ?? "")?.name ?? "—",
      start: it.start_date,
      end: it.kind === "milestone" ? "" : it.end_date,
      days: it.kind === "milestone" ? "" : durationDays(it),
      kind: it.kind === "milestone" ? "Hito" : "Tarea",
      deps: (predecessorsById.get(it.id) ?? []).join(", "),
    });
    const swatch = row.getCell("owner");
    swatch.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${hexForOwner(it.owner_key)}` },
    };
    swatch.font = { color: { argb: "FFFFFFFF" }, bold: true };
  }
  table.views = [{ state: "frozen", ySplit: 1 }];

  // ─── Sheet 2: visual Gantt grid ─────────────────────────────────────
  if (items.length > 0) {
    const minStart = items.reduce(
      (acc, it) => (it.start_date < acc ? it.start_date : acc),
      items[0].start_date,
    );
    const maxEnd = items.reduce(
      (acc, it) => (it.end_date > acc ? it.end_date : acc),
      items[0].end_date,
    );
    const rangeStart = addDays(parseISO(minStart), -1);
    const rangeEnd = addDays(parseISO(maxEnd), 1);
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

    const holidaySet = new Set(
      holidays
        .filter((h) => timeline.holiday_countries.includes(h.country))
        .map((h) => h.date),
    );

    const gantt = wb.addWorksheet("Gantt");
    gantt.getColumn(1).width = 38;
    gantt.getCell(1, 1).value = "Tarea";
    gantt.getCell(1, 1).font = { bold: true };

    days.forEach((d, i) => {
      const col = i + 2;
      gantt.getColumn(col).width = 3.6;
      const cell = gantt.getCell(1, col);
      cell.value = format(d, "d/M");
      cell.alignment = { textRotation: 90, horizontal: "center" };
      cell.font = { size: 8, bold: true };
      const iso = format(d, "yyyy-MM-dd");
      const weekend = timeline.weekends_enabled && isWeekend(d);
      const holiday = holidaySet.has(iso);
      if (holiday) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFECACA" },
        };
      } else if (weekend) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE2E8F0" },
        };
      }
    });

    items.forEach((it, idx) => {
      const r = idx + 2;
      gantt.getCell(r, 1).value = it.title;
      const startIdx = differenceInCalendarDays(parseISO(it.start_date), rangeStart);
      const endIdx = differenceInCalendarDays(parseISO(it.end_date), rangeStart);
      const argb = `FF${hexForOwner(it.owner_key)}`;
      for (let i = startIdx; i <= endIdx; i++) {
        const cell = gantt.getCell(r, i + 2);
        if (it.kind === "milestone") {
          cell.value = "◆";
          cell.alignment = { horizontal: "center" };
          cell.font = { color: { argb }, bold: true };
        } else {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb },
          };
        }
      }
    });
    gantt.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = timeline.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40);
  a.download = `timeline-${safe || "export"}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
