import { addDays, format, nextMonday, parseISO, startOfDay } from "date-fns";

import type {
  TimelineDependencyType,
  TimelineItemKind,
  TimelineOwner,
} from "@/lib/timeliner/types";

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
 * shorten and drag the bars, rename what differs, and the plan is done. The
 * dependency chain ships with it, so dragging one bar carries the rest.
 */

export type TemplateItem = {
  title: string;
  owner: TimelineOwner;
  kind: TimelineItemKind;
  /** Days from the anchor Monday. */
  start: number;
  end: number;
  /** Surfaces in the MASTER view. Milestones are key on their own. */
  key?: boolean;
};

export type TemplateDependency = {
  /** Index into `TEMPLATE_ITEMS`. */
  from: number;
  to: number;
  type: TimelineDependencyType;
  lag?: number;
};

export const TEMPLATE_ITEMS: readonly TemplateItem[] = [
  // — Creatividades —
  { title: "Envio de Editables", owner: "client", kind: "milestone", start: 11, end: 11 },
  { title: "Recomendación de Medios de Formatos", owner: "sangria", kind: "task", start: 14, end: 17 },
  { title: "SOW creativo firmado", owner: "client", kind: "milestone", start: 17, end: 17 },
  { title: "Produccion (Social Media)", owner: "sangria", kind: "task", start: 17, end: 28, key: true },
  { title: "Presentacion creatividades", owner: "sangria", kind: "milestone", start: 28, end: 28 },
  { title: "Feedback Consolidado", owner: "client", kind: "task", start: 29, end: 30 },
  { title: "Aplicacion de cambios", owner: "sangria", kind: "task", start: 31, end: 32 },
  { title: "2da Ronda de Feedback", owner: "client", kind: "task", start: 32, end: 32 },
  { title: "Aplicacion de Cambios", owner: "sangria", kind: "task", start: 34, end: 35 },
  { title: "Aprobacion Final", owner: "client", kind: "milestone", start: 36, end: 36 },
  // — Plan de medios —
  { title: "Brief", owner: "client", kind: "milestone", start: 1, end: 1 },
  { title: "Confirmación de Fecha de Presentacion", owner: "client", kind: "milestone", start: 7, end: 7 },
  { title: "Preparacion de Propuesta de Medios", owner: "sangria", kind: "task", start: 8, end: 21, key: true },
  { title: "Presentación del Plan de Medios", owner: "sangria", kind: "milestone", start: 22, end: 22 },
  { title: "Feedback Consolidado", owner: "client", kind: "task", start: 23, end: 25 },
  { title: "Aplicacion de Cambios", owner: "sangria", kind: "task", start: 28, end: 30 },
  { title: "Feedback Consolidado", owner: "client", kind: "task", start: 30, end: 31 },
  { title: "Aprobacion Final Plan de Medios", owner: "client", kind: "milestone", start: 32, end: 32 },
  { title: "Tagging y configuracion de Eventos", owner: "sangria", kind: "task", start: 35, end: 37 },
  { title: "Trafico de Campaña", owner: "sangria", kind: "task", start: 37, end: 38 },
  { title: "Ajustes Al sitio", owner: "client", kind: "task", start: 31, end: 37 },
  { title: "Campaña Live", owner: "sangria", kind: "milestone", start: 38, end: 38, key: true },
] as const;

/**
 * The chain the template ships with. Each link carries the exact gap the
 * template was drawn with, so seeding changes nothing on screen — but from
 * then on, dragging any bar takes everything downstream with it.
 */
export const TEMPLATE_DEPENDENCIES: readonly TemplateDependency[] = [
  // Creatividades: editables → recomendación → SOW → producción → …
  { from: 0, to: 1, type: "FS", lag: 2 },
  { from: 1, to: 2, type: "FF", lag: 0 },
  { from: 2, to: 3, type: "SS", lag: 0 },
  { from: 3, to: 4, type: "FF", lag: 0 },
  { from: 4, to: 5, type: "FS", lag: 0 },
  { from: 5, to: 6, type: "FS", lag: 0 },
  { from: 6, to: 7, type: "FF", lag: 0 },
  { from: 7, to: 8, type: "FS", lag: 1 },
  { from: 8, to: 9, type: "FS", lag: 0 },
  // Plan de medios: brief → fecha → propuesta → presentación → …
  { from: 10, to: 11, type: "FS", lag: 5 },
  { from: 11, to: 12, type: "FS", lag: 0 },
  { from: 12, to: 13, type: "FS", lag: 0 },
  { from: 13, to: 14, type: "FS", lag: 0 },
  { from: 14, to: 15, type: "FS", lag: 2 },
  { from: 15, to: 16, type: "FF", lag: 1 },
  { from: 16, to: 17, type: "FS", lag: 0 },
  { from: 17, to: 18, type: "FS", lag: 2 },
  { from: 18, to: 19, type: "FF", lag: 1 },
  { from: 19, to: 21, type: "FF", lag: 0 },
  // Ajustes al sitio corren en paralelo desde la aprobación creativa y tienen
  // que estar listos antes de que la campaña salga.
  { from: 17, to: 20, type: "SS", lag: -1 },
  { from: 20, to: 21, type: "FS", lag: 0 },
  // El tráfico no sale hasta tener las piezas aprobadas.
  { from: 9, to: 19, type: "FS", lag: 0 },
] as const;

export type TemplateRow = {
  title: string;
  owner_key: TimelineOwner;
  kind: TimelineItemKind;
  start_date: string;
  end_date: string;
  is_key: boolean;
  position: number;
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

/** The template's rows resolved against a concrete anchor date. */
export function buildTemplateRows(anchorISO: string): TemplateRow[] {
  const anchor = parseISO(anchorISO);
  return TEMPLATE_ITEMS.map((t, i) => ({
    title: t.title,
    owner_key: t.owner,
    kind: t.kind,
    start_date: format(addDays(anchor, t.start), "yyyy-MM-dd"),
    end_date: format(addDays(anchor, t.kind === "milestone" ? t.start : t.end), "yyyy-MM-dd"),
    is_key: t.key ?? false,
    position: i,
  }));
}
