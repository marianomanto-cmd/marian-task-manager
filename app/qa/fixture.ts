import { TEMPLATE_DEPENDENCIES, buildTemplateRows } from "@/lib/timeliner/template";
import type {
  Holiday,
  TimelineDependency,
  TimelineGroup,
  TimelineItem,
} from "@/lib/timeliner/types";

/** Shared fixture for the QA pages: the base template, anchored and grouped. */
const rows = buildTemplateRows("2026-08-24");

export const groups: TimelineGroup[] = [
  { id: "gA", timeline_id: "t", name: "Creatividades", position: 0 },
  { id: "gB", timeline_id: "t", name: "Plan de medios", position: 1 },
];

export const items: TimelineItem[] = rows.map((r, i) => ({
  id: `i${i}`,
  timeline_id: "t",
  group_id: i < 10 ? "gA" : "gB",
  title: r.title,
  owner_key: r.owner_key,
  start_date: r.start_date,
  end_date: r.end_date,
  kind: r.kind,
  position: r.position,
  is_key: r.is_key,
}));

/** Only part of the chain, so QA has unlinked pairs to join by hand. */
export const dependencies: TimelineDependency[] = TEMPLATE_DEPENDENCIES.slice(0, 6).map(
  (d, i) => ({
    id: `d${i}`,
    timeline_id: "t",
    from_item_id: `i${d.from}`,
    to_item_id: `i${d.to}`,
    dep_type: d.type,
    lag_days: d.lag ?? 0,
  }),
);

export const holidays: Holiday[] = [
  { country: "AR", date: "2026-09-15", name: "Feriado AR de prueba" },
];

export const timeline = {
  weekends_enabled: true,
  holiday_countries: ["AR"],
};
