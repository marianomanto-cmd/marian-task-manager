import { addDays, format, nextMonday, parseISO, startOfDay } from "date-fns";

import type { TimelineItemKind, TimelineOwner } from "@/lib/timeliner/types";

/**
 * The base project every new timeline starts from.
 *
 * Lifted straight off "Colombia Positioning" — the shape of a standard
 * campaign, both tracks (plan de medios and creatividades) with the same
 * items, the same order and the same relative spacing. Offsets are days from
 * the anchor Monday, so a timeline created from it keeps the original weekday
 * alignment: what was drawn to start on a Tuesday still starts on a Tuesday,
 * and nothing lands on a weekend that didn't before.
 *
 * The point is to hand the planner a whole project on day one: stretch,
 * shorten and drag the bars, rename what differs, and the plan is done.
 */

export type TemplateItem = {
  title: string;
  owner: TimelineOwner;
  kind: TimelineItemKind;
  /** Days from the anchor Monday. */
  start: number;
  end: number;
};

export const TEMPLATE_ITEMS: readonly TemplateItem[] = [
  // — Creatividades —
  { title: "Envio de Editables", owner: "client", kind: "milestone", start: 11, end: 11 },
  { title: "Recomendación de Medios de Formatos", owner: "sangria", kind: "task", start: 14, end: 17 },
  { title: "SOW creativo firmado", owner: "client", kind: "milestone", start: 17, end: 17 },
  { title: "Produccion (Social Media)", owner: "sangria", kind: "task", start: 17, end: 28 },
  { title: "Presentacion creatividades", owner: "sangria", kind: "milestone", start: 28, end: 28 },
  { title: "Feedback Consolidado", owner: "client", kind: "task", start: 29, end: 30 },
  { title: "Aplicacion de cambios", owner: "sangria", kind: "task", start: 31, end: 32 },
  { title: "2da Ronda de Feedback", owner: "client", kind: "task", start: 32, end: 32 },
  { title: "Aplicacion de Cambios", owner: "sangria", kind: "task", start: 34, end: 35 },
  { title: "Aprobacion Final", owner: "client", kind: "milestone", start: 36, end: 36 },
  // — Plan de medios —
  { title: "Brief", owner: "client", kind: "milestone", start: 1, end: 1 },
  { title: "Confirmación de Fecha de Presentacion", owner: "client", kind: "milestone", start: 7, end: 7 },
  { title: "Preparacion de Propuesta de Medios", owner: "sangria", kind: "task", start: 8, end: 21 },
  { title: "Presentación del Plan de Medios", owner: "sangria", kind: "milestone", start: 22, end: 22 },
  { title: "Feedback Consolidado", owner: "client", kind: "task", start: 23, end: 25 },
  { title: "Aplicacion de Cambios", owner: "sangria", kind: "task", start: 28, end: 30 },
  { title: "Feedback Consolidado", owner: "client", kind: "task", start: 30, end: 31 },
  { title: "Aprobacion Final Plan de Medios", owner: "client", kind: "milestone", start: 32, end: 32 },
  { title: "Tagging y configuracion de Eventos", owner: "sangria", kind: "task", start: 35, end: 37 },
  { title: "Trafico de Campaña", owner: "sangria", kind: "task", start: 37, end: 38 },
  { title: "Ajustes Al sitio", owner: "client", kind: "task", start: 31, end: 37 },
  { title: "Campaña Live", owner: "sangria", kind: "milestone", start: 38, end: 38 },
] as const;

/** The two tracks the template is drawn in, as timeline groups. */
export const TEMPLATE_GROUPS = [
  { name: "Creatividades", from: 0, to: 9 },
  { name: "Plan de medios", from: 10, to: 21 },
] as const;

export type TemplateRow = {
  title: string;
  owner_key: TimelineOwner;
  kind: TimelineItemKind;
  start_date: string;
  end_date: string;
  position: number;
  /** Index into TEMPLATE_GROUPS, or null when the item stands on its own. */
  group: number | null;
};

/**
 * The anchor a freshly created timeline hangs off: the coming Monday. Today
 * counts as "coming" when today *is* a Monday, so a timeline made on a Monday
 * starts that same week.
 */
export function defaultTemplateAnchor(today: Date = new Date()): string {
  const d = startOfDay(today);
  return format(d.getDay() === 1 ? d : nextMonday(d), "yyyy-MM-dd");
}

function groupIndexFor(itemIndex: number): number | null {
  const at = TEMPLATE_GROUPS.findIndex(
    (g) => itemIndex >= g.from && itemIndex <= g.to,
  );
  return at === -1 ? null : at;
}

/** The template's rows resolved against a concrete anchor date. */
export function buildTemplateRows(anchorISO: string): TemplateRow[] {
  const anchor = parseISO(anchorISO);
  return TEMPLATE_ITEMS.map((t, i) => ({
    title: t.title,
    owner_key: t.owner,
    kind: t.kind,
    start_date: format(addDays(anchor, t.start), "yyyy-MM-dd"),
    end_date: format(
      addDays(anchor, t.kind === "milestone" ? t.start : t.end),
      "yyyy-MM-dd",
    ),
    position: i,
    group: groupIndexFor(i),
  }));
}
