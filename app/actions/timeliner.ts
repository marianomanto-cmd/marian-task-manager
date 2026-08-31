"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import type {
  Holiday,
  Timeline,
  TimelineDependency,
  TimelineGroup,
  TimelineItem,
} from "@/lib/timeliner/types";
import { wouldCycle } from "@/lib/timeliner/schedule";
import {
  TEMPLATE_DEPENDENCIES,
  buildTemplateRows,
  defaultTemplateAnchor,
} from "@/lib/timeliner/template";
import { createClient } from "@/lib/supabase/server";

const TIMELINE_COLUMNS =
  "id, name, position, weekends_enabled, holiday_countries, share_token";
const GROUP_COLUMNS = "id, timeline_id, name, position";
const ITEM_COLUMNS =
  "id, timeline_id, group_id, title, owner_key, start_date, end_date, kind, position, is_key";
const DEPENDENCY_COLUMNS =
  "id, timeline_id, from_item_id, to_item_id, dep_type, lag_days";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const nameSchema = z.string().trim().min(1, "Falta el nombre").max(120);
const titleSchema = z.string().trim().min(1, "Falta el título").max(300);
const kindSchema = z.enum(["task", "milestone"]);
const ownerSchema = z.enum(["sangria", "client", "third_party"]);
const countrySchema = z.enum(["AR", "PA", "US", "ES"]);
const depTypeSchema = z.enum(["FS", "SS", "FF", "SF"]);
const lagSchema = z.number().int().min(-365).max(365);

const createTimelineSchema = z.object({
  name: nameSchema,
  /** Seed the base project (see `lib/timeliner/template.ts`). Default on. */
  use_template: z.boolean().optional(),
  /** Monday the template hangs off. Defaults to the coming Monday. */
  anchor_date: dateSchema.optional(),
});
const renameTimelineSchema = z.object({ id: z.string().uuid(), name: nameSchema });
const settingsSchema = z.object({
  id: z.string().uuid(),
  weekends_enabled: z.boolean().optional(),
  holiday_countries: z.array(countrySchema).max(8).optional(),
});

const createGroupSchema = z.object({
  timeline_id: z.string().uuid(),
  name: nameSchema,
});
const renameGroupSchema = z.object({ id: z.string().uuid(), name: nameSchema });

const dependencySchema = z.object({
  timeline_id: z.string().uuid(),
  from_item_id: z.string().uuid(),
  to_item_id: z.string().uuid(),
  dep_type: depTypeSchema.default("FS"),
  lag_days: lagSchema.default(0),
});

const updateDependencySchema = z.object({
  id: z.string().uuid(),
  dep_type: depTypeSchema.optional(),
  lag_days: lagSchema.optional(),
});

/** A batch of date moves: the bar the user dragged plus its cascade. */
const rescheduleSchema = z.object({
  timeline_id: z.string().uuid(),
  items: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          start_date: dateSchema,
          end_date: dateSchema,
        })
        .refine((v) => v.end_date >= v.start_date, {
          message: "La fecha de fin no puede ser anterior al inicio",
          path: ["end_date"],
        }),
    )
    .min(1)
    .max(500),
});

const createItemSchema = z
  .object({
    timeline_id: z.string().uuid(),
    group_id: z.string().uuid().nullable().optional(),
    title: titleSchema,
    owner_key: ownerSchema.nullable().optional(),
    start_date: dateSchema,
    end_date: dateSchema,
    kind: kindSchema.default("task"),
    is_key: z.boolean().optional(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "La fecha de fin no puede ser anterior al inicio",
    path: ["end_date"],
  });

const updateItemSchema = z
  .object({
    id: z.string().uuid(),
    group_id: z.string().uuid().nullable().optional(),
    title: titleSchema.optional(),
    owner_key: ownerSchema.nullable().optional(),
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional(),
    kind: kindSchema.optional(),
    position: z.number().int().min(0).optional(),
    is_key: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.start_date === undefined ||
      v.end_date === undefined ||
      v.end_date >= v.start_date,
    { message: "La fecha de fin no puede ser anterior al inicio", path: ["end_date"] },
  );

const reorderItemsSchema = z.object({
  timeline_id: z.string().uuid(),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        group_id: z.string().uuid().nullable(),
        position: z.number().int().min(0),
      }),
    )
    .max(1000),
});

function asInvalid(message: string): ActionResult<never> {
  return { ok: false, code: "invalid_input", message };
}
function asUnknown(err: unknown): ActionResult<never> {
  return {
    ok: false,
    code: "unknown",
    message: err instanceof Error ? err.message : "Error desconocido",
  };
}

async function requireUser(): Promise<
  | { ok: true; userId: string }
  | { ok: false; result: ActionResult<never> }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "auth_required",
        message: "Iniciá sesión para usar Timeliner.",
      },
    };
  }
  return { ok: true, userId: user.id };
}

export type TimelinerData = {
  timelines: Timeline[];
  groups: TimelineGroup[];
  items: TimelineItem[];
  dependencies: TimelineDependency[];
  holidays: Holiday[];
};

export async function getTimelinerAction(): Promise<
  ActionResult<TimelinerData>
> {
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const [timelinesRes, itemsRes, groupsRes, depsRes, holidaysRes] =
      await Promise.all([
        supabase
          .from("timelines")
          .select(TIMELINE_COLUMNS)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("timeline_items")
          .select(ITEM_COLUMNS)
          .order("position", { ascending: true })
          .order("start_date", { ascending: true }),
        supabase
          .from("timeline_groups")
          .select(GROUP_COLUMNS)
          .order("position", { ascending: true }),
        supabase.from("timeline_dependencies").select(DEPENDENCY_COLUMNS),
        supabase.from("holidays").select("country, date, name"),
      ]);
    if (timelinesRes.error) throw new Error(timelinesRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    // Groups, dependencies + holidays are optional; if their tables aren't
    // present yet (migrations 0025 / 0030 / 0006), skip them rather than
    // breaking the board.
    const groups = groupsRes.error
      ? []
      : ((groupsRes.data ?? []) as TimelineGroup[]);
    const dependencies = depsRes.error
      ? []
      : ((depsRes.data ?? []) as TimelineDependency[]);
    const holidays = holidaysRes.error
      ? []
      : ((holidaysRes.data ?? []) as Holiday[]);

    return {
      ok: true,
      data: {
        timelines: (timelinesRes.data ?? []) as Timeline[],
        groups,
        items: (itemsRes.data ?? []) as TimelineItem[],
        dependencies,
        holidays,
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createTimelineAction(
  input: unknown,
): Promise<ActionResult<Timeline>> {
  const parsed = createTimelineSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: maxRow } = await supabase
      .from("timelines")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("timelines")
      .insert({ name: parsed.data.name, position, created_by: auth.userId })
      .select(TIMELINE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    const timeline = data as Timeline;

    if (parsed.data.use_template !== false) {
      await seedTemplate(
        supabase,
        timeline.id,
        parsed.data.anchor_date ?? defaultTemplateAnchor(),
      );
    }

    return { ok: true, data: timeline };
  } catch (err) {
    return asUnknown(err);
  }
}

/**
 * Fill a brand-new timeline with the base project — every task, hito and link
 * of the template, hung off `anchorISO`.
 *
 * Seeding is best-effort by design: the timeline itself is already created and
 * usable, so a failure here leaves an empty timeline rather than losing the
 * user's click. The items go in first because the links reference their ids;
 * the insert preserves order, so template indices map straight onto rows.
 */
async function seedTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  timelineId: string,
  anchorISO: string,
): Promise<void> {
  const rows = buildTemplateRows(anchorISO).map((r) => ({
    timeline_id: timelineId,
    group_id: null,
    title: r.title,
    owner_key: r.owner_key,
    start_date: r.start_date,
    end_date: r.end_date,
    kind: r.kind,
    position: r.position,
    is_key: r.is_key,
  }));

  const { data: inserted, error } = await supabase
    .from("timeline_items")
    .insert(rows)
    .select("id, position");
  if (error || !inserted) return;

  // Insert order isn't a promise Postgres makes — match on `position`, which
  // is the template index by construction.
  const idByPosition = new Map<number, string>(
    (inserted as { id: string; position: number }[]).map((r) => [r.position, r.id]),
  );

  const links = TEMPLATE_DEPENDENCIES.flatMap((d) => {
    const from = idByPosition.get(d.from);
    const to = idByPosition.get(d.to);
    if (!from || !to) return [];
    return [
      {
        timeline_id: timelineId,
        from_item_id: from,
        to_item_id: to,
        dep_type: d.type,
        lag_days: d.lag ?? 0,
      },
    ];
  });
  if (links.length > 0) await supabase.from("timeline_dependencies").insert(links);
}

export async function renameTimelineAction(
  input: unknown,
): Promise<ActionResult<Timeline>> {
  const parsed = renameTimelineSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("timelines")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.id)
      .select(TIMELINE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Timeline };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateTimelineSettingsAction(
  input: unknown,
): Promise<ActionResult<Timeline>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (parsed.data.weekends_enabled !== undefined)
      patch.weekends_enabled = parsed.data.weekends_enabled;
    if (parsed.data.holiday_countries !== undefined)
      patch.holiday_countries = parsed.data.holiday_countries;

    const { data, error } = await supabase
      .from("timelines")
      .update(patch)
      .eq("id", parsed.data.id)
      .select(TIMELINE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Timeline };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteTimelineAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("timelines")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

/**
 * Create or rotate the timeline's public link (`/t/<token>`). Rotating writes a
 * fresh token, which kills the previous link — that's how a link handed to the
 * wrong person is taken back.
 */
export async function rotateTimelineShareTokenAction(
  id: string,
): Promise<ActionResult<Timeline>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("timelines")
      .update({ share_token: crypto.randomUUID() })
      .eq("id", parsed.data)
      .select(TIMELINE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Timeline };
  } catch (err) {
    return asUnknown(err);
  }
}

/** Stop sharing: the link 404s from here on. */
export async function revokeTimelineShareTokenAction(
  id: string,
): Promise<ActionResult<Timeline>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("timelines")
      .update({ share_token: null })
      .eq("id", parsed.data)
      .select(TIMELINE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Timeline };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createTimelineGroupAction(
  input: unknown,
): Promise<ActionResult<TimelineGroup>> {
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: maxRow } = await supabase
      .from("timeline_groups")
      .select("position")
      .eq("timeline_id", parsed.data.timeline_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("timeline_groups")
      .insert({
        timeline_id: parsed.data.timeline_id,
        name: parsed.data.name,
        position,
      })
      .select(GROUP_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as TimelineGroup };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function renameTimelineGroupAction(
  input: unknown,
): Promise<ActionResult<TimelineGroup>> {
  const parsed = renameGroupSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("timeline_groups")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.id)
      .select(GROUP_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as TimelineGroup };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteTimelineGroupAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("timeline_groups")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createTimelineItemAction(
  input: unknown,
): Promise<ActionResult<TimelineItem>> {
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: maxRow } = await supabase
      .from("timeline_items")
      .select("position")
      .eq("timeline_id", parsed.data.timeline_id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const isMilestone = parsed.data.kind === "milestone";
    const { data, error } = await supabase
      .from("timeline_items")
      .insert({
        timeline_id: parsed.data.timeline_id,
        group_id: parsed.data.group_id ?? null,
        title: parsed.data.title,
        owner_key: parsed.data.owner_key ?? null,
        start_date: parsed.data.start_date,
        end_date: isMilestone ? parsed.data.start_date : parsed.data.end_date,
        kind: parsed.data.kind,
        position,
        is_key: parsed.data.is_key ?? false,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as TimelineItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateTimelineItemAction(
  input: unknown,
): Promise<ActionResult<TimelineItem>> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (parsed.data.group_id !== undefined)
      patch.group_id = parsed.data.group_id ?? null;
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.owner_key !== undefined)
      patch.owner_key = parsed.data.owner_key ?? null;
    if (parsed.data.start_date !== undefined)
      patch.start_date = parsed.data.start_date;
    if (parsed.data.end_date !== undefined)
      patch.end_date = parsed.data.end_date;
    if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
    if (parsed.data.position !== undefined)
      patch.position = parsed.data.position;
    if (parsed.data.is_key !== undefined) patch.is_key = parsed.data.is_key;

    const { data, error } = await supabase
      .from("timeline_items")
      .update(patch)
      .eq("id", parsed.data.id)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as TimelineItem };
  } catch (err) {
    return asUnknown(err);
  }
}

/**
 * Persist a new vertical ordering (and group assignment) for a batch of items.
 * The client sends only the rows whose position or group changed; each is
 * updated in place. Scoped to a single timeline for safety.
 */
export async function reorderTimelineItemsAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = reorderItemsSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const results = await Promise.all(
      parsed.data.items.map((it) =>
        supabase
          .from("timeline_items")
          .update({ position: it.position, group_id: it.group_id })
          .eq("id", it.id)
          .eq("timeline_id", parsed.data.timeline_id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return { ok: true, data: { count: parsed.data.items.length } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteTimelineItemAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("timeline_items")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

/**
 * Link two items. The pair is unique, so re-dragging an existing link edits it
 * in place instead of stacking a second arrow — that's how you change an
 * FS into an SS without deleting anything first.
 *
 * Two things are refused: a link whose ends aren't both in this timeline, and
 * one that would close a loop. A loop has no consistent schedule, so letting
 * one in would leave part of the plan permanently unable to follow a drag.
 */
export async function createTimelineDependencyAction(
  input: unknown,
): Promise<ActionResult<TimelineDependency>> {
  const parsed = dependencySchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;
  if (parsed.data.from_item_id === parsed.data.to_item_id)
    return asInvalid("Una tarea no puede depender de sí misma.");

  try {
    const supabase = await createClient();

    const { data: endpoints, error: endpointsError } = await supabase
      .from("timeline_items")
      .select("id")
      .eq("timeline_id", parsed.data.timeline_id)
      .in("id", [parsed.data.from_item_id, parsed.data.to_item_id]);
    if (endpointsError) throw new Error(endpointsError.message);
    if ((endpoints ?? []).length !== 2)
      return asInvalid("Sólo se pueden vincular tareas del mismo timeline.");

    const { data: existing, error: existingError } = await supabase
      .from("timeline_dependencies")
      .select(DEPENDENCY_COLUMNS)
      .eq("timeline_id", parsed.data.timeline_id);
    if (existingError) throw new Error(existingError.message);

    const current = (existing ?? []) as TimelineDependency[];
    const already = current.find(
      (d) =>
        d.from_item_id === parsed.data.from_item_id &&
        d.to_item_id === parsed.data.to_item_id,
    );
    if (already) {
      const { data, error } = await supabase
        .from("timeline_dependencies")
        .update({ dep_type: parsed.data.dep_type, lag_days: parsed.data.lag_days })
        .eq("id", already.id)
        .select(DEPENDENCY_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, data: data as TimelineDependency };
    }

    if (wouldCycle(current, parsed.data.from_item_id, parsed.data.to_item_id))
      return asInvalid("Esa dependencia arma un círculo entre tareas.");

    const { data, error } = await supabase
      .from("timeline_dependencies")
      .insert({
        timeline_id: parsed.data.timeline_id,
        from_item_id: parsed.data.from_item_id,
        to_item_id: parsed.data.to_item_id,
        dep_type: parsed.data.dep_type,
        lag_days: parsed.data.lag_days,
      })
      .select(DEPENDENCY_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as TimelineDependency };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateTimelineDependencyAction(
  input: unknown,
): Promise<ActionResult<TimelineDependency>> {
  const parsed = updateDependencySchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = {};
    if (parsed.data.dep_type !== undefined) patch.dep_type = parsed.data.dep_type;
    if (parsed.data.lag_days !== undefined) patch.lag_days = parsed.data.lag_days;

    const { data, error } = await supabase
      .from("timeline_dependencies")
      .update(patch)
      .eq("id", parsed.data.id)
      .select(DEPENDENCY_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as TimelineDependency };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteTimelineDependencyAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("timeline_dependencies")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

/**
 * Write a whole cascade at once: the bar the user dragged plus every item the
 * dependency graph pushed along with it. The board computes the new dates with
 * `cascadeSchedule` while dragging — it already holds the graph — and commits
 * the result here, so what was previewed under the cursor is exactly what gets
 * saved. Every row is scoped to the timeline, so a batch can't reach outside it.
 */
export async function rescheduleTimelineItemsAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const results = await Promise.all(
      parsed.data.items.map((it) =>
        supabase
          .from("timeline_items")
          .update({ start_date: it.start_date, end_date: it.end_date })
          .eq("id", it.id)
          .eq("timeline_id", parsed.data.timeline_id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    return { ok: true, data: { count: parsed.data.items.length } };
  } catch (err) {
    return asUnknown(err);
  }
}
