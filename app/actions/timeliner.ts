"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import type {
  Holiday,
  Timeline,
  TimelineGroup,
  TimelineItem,
} from "@/lib/timeliner/types";
import { createClient } from "@/lib/supabase/server";

const TIMELINE_COLUMNS =
  "id, name, position, weekends_enabled, holiday_countries";
const GROUP_COLUMNS = "id, timeline_id, name, position";
const ITEM_COLUMNS =
  "id, timeline_id, group_id, title, owner_key, start_date, end_date, kind, position";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const nameSchema = z.string().trim().min(1, "Falta el nombre").max(120);
const titleSchema = z.string().trim().min(1, "Falta el título").max(300);
const kindSchema = z.enum(["task", "milestone"]);
const ownerSchema = z.enum(["sangria", "client", "third_party"]);
const countrySchema = z.enum(["AR", "PA", "US", "ES"]);

const createTimelineSchema = z.object({ name: nameSchema });
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

const createItemSchema = z
  .object({
    timeline_id: z.string().uuid(),
    group_id: z.string().uuid().nullable().optional(),
    title: titleSchema,
    owner_key: ownerSchema.nullable().optional(),
    start_date: dateSchema,
    end_date: dateSchema,
    kind: kindSchema.default("task"),
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
  holidays: Holiday[];
};

export async function getTimelinerAction(): Promise<
  ActionResult<TimelinerData>
> {
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const [timelinesRes, itemsRes, groupsRes, holidaysRes] = await Promise.all([
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
      supabase.from("holidays").select("country, date, name"),
    ]);
    if (timelinesRes.error) throw new Error(timelinesRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    // Groups + holidays are optional; if their tables aren't present yet
    // (migrations 0025 / 0006), skip them rather than breaking the board.
    const groups = groupsRes.error
      ? []
      : ((groupsRes.data ?? []) as TimelineGroup[]);
    const holidays = holidaysRes.error
      ? []
      : ((holidaysRes.data ?? []) as Holiday[]);

    return {
      ok: true,
      data: {
        timelines: (timelinesRes.data ?? []) as Timeline[],
        groups,
        items: (itemsRes.data ?? []) as TimelineItem[],
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
    return { ok: true, data: data as Timeline };
  } catch (err) {
    return asUnknown(err);
  }
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
