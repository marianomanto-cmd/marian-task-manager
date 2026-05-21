"use server";

import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import {
  YISS_COLORS,
  YISS_ITEM_CATEGORIES,
  YISS_ITEM_STATUSES,
  yissPickStableColor,
  type YissColor,
  type YissGroup,
  type YissItem,
  type YissItemCategory,
  type YissItemStatus,
  type YissProjectMeta,
} from "@/lib/yiss/types";

const ITEM_COLUMNS = `
  id, project, title, description, category, status,
  due_date, link, position, archived_at, created_at, updated_at
`;
const META_COLUMNS = "project, color, emoji, group:grp, position";

const categorySchema = z.enum(
  YISS_ITEM_CATEGORIES as readonly [YissItemCategory, ...YissItemCategory[]],
);
const statusSchema = z.enum(
  YISS_ITEM_STATUSES as readonly [YissItemStatus, ...YissItemStatus[]],
);
const colorSchema = z.enum(
  YISS_COLORS as readonly [YissColor, ...YissColor[]],
);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const linkSchema = z.string().trim().max(2000);
const projectSchema = z.string().trim().min(1, "Falta el proyecto").max(120);
const titleSchema = z.string().trim().min(1, "Falta la tarea").max(500);
const descriptionSchema = z.string().trim().max(4000);
const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Falta el nombre del grupo")
  .max(120);

const archiveModeSchema = z.enum(["active", "archive"]).default("active");

const listSchema = z.object({
  archiveMode: archiveModeSchema.optional(),
});

const createItemSchema = z.object({
  project: projectSchema,
  title: titleSchema,
  category: categorySchema.default("otros"),
  status: statusSchema.default("pending"),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
  description: descriptionSchema.optional().nullable(),
});

const createProjectSchema = z.object({
  name: projectSchema,
  group: z.string().trim().max(120).nullable().optional(),
  title: titleSchema,
  category: categorySchema.default("otros"),
});

const updateItemSchema = z.object({
  id: z.string().uuid(),
  project: projectSchema.optional(),
  title: titleSchema.optional(),
  description: descriptionSchema.optional().nullable(),
  category: categorySchema.optional(),
  status: statusSchema.optional(),
  due_date: dateSchema.optional().nullable(),
  link: linkSchema.optional().nullable(),
});

const renameProjectSchema = z.object({
  from: projectSchema,
  to: projectSchema,
});

const archiveProjectSchema = z.object({
  project: projectSchema,
  archive: z.boolean(),
});

const reorderItemsSchema = z.object({
  project: projectSchema,
  ids: z.array(z.string().uuid()).max(500),
});

const metaUpdateSchema = z.object({
  project: projectSchema,
  color: colorSchema.optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
  group: z.string().trim().max(120).nullable().optional(),
});

export type ListYissItemsInput = z.infer<typeof listSchema>;

/**
 * Anon Supabase client (no cookies, no session). Board - Yiss is a public,
 * no-login board, so every request goes through the anon role regardless of
 * whether an agency member happens to be signed in. RLS on the yiss_* tables
 * is permissive for anon.
 */
function yissClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  );
}

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

export type YissBoardData = {
  items: YissItem[];
  meta: YissProjectMeta[];
  groups: YissGroup[];
};

export async function listYissBoardAction(
  input: ListYissItemsInput = {},
): Promise<ActionResult<YissBoardData>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    let itemsQuery = supabase
      .from("yiss_project_items")
      .select(ITEM_COLUMNS)
      .order("project", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const archiveMode = parsed.data.archiveMode ?? "active";
    if (archiveMode === "active") {
      itemsQuery = itemsQuery.is("archived_at", null);
    } else {
      itemsQuery = itemsQuery.not("archived_at", "is", null);
    }

    const [itemsRes, metaRes, groupsRes] = await Promise.all([
      itemsQuery,
      supabase
        .from("yiss_projects_meta")
        .select(META_COLUMNS)
        .order("position", { ascending: true })
        .order("project", { ascending: true }),
      supabase
        .from("yiss_groups")
        .select("name, position")
        .order("position", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (metaRes.error) throw new Error(metaRes.error.message);
    if (groupsRes.error) throw new Error(groupsRes.error.message);

    return {
      ok: true,
      data: {
        items: (itemsRes.data ?? []) as YissItem[],
        meta: (metaRes.data ?? []) as YissProjectMeta[],
        groups: (groupsRes.data ?? []) as YissGroup[],
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createYissItemAction(
  input: unknown,
): Promise<ActionResult<YissItem>> {
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { data: maxRow } = await supabase
      .from("yiss_project_items")
      .select("position")
      .eq("project", parsed.data.project)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("yiss_project_items")
      .insert({
        project: parsed.data.project,
        title: parsed.data.title,
        description: parsed.data.description?.length
          ? parsed.data.description
          : null,
        category: parsed.data.category,
        status: parsed.data.status,
        due_date: parsed.data.due_date ?? null,
        link: parsed.data.link?.length ? parsed.data.link : null,
        position: nextPosition,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as YissItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createYissProjectAction(
  input: unknown,
): Promise<ActionResult<{ project: string; item: YissItem }>> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const name = parsed.data.name;

    const [existingMeta, existingItem] = await Promise.all([
      supabase
        .from("yiss_projects_meta")
        .select("project")
        .eq("project", name)
        .maybeSingle(),
      supabase
        .from("yiss_project_items")
        .select("id")
        .eq("project", name)
        .limit(1)
        .maybeSingle(),
    ]);
    if (existingMeta.data || existingItem.data)
      return asInvalid(`Ya existe un proyecto llamado "${name}".`);

    const { data: maxRow } = await supabase
      .from("yiss_projects_meta")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const group = parsed.data.group?.length ? parsed.data.group : null;
    const { error: metaError } = await supabase
      .from("yiss_projects_meta")
      .insert({
        project: name,
        color: yissPickStableColor(name),
        emoji: null,
        grp: group,
        position,
      });
    if (metaError) throw new Error(metaError.message);

    const { data: item, error: itemError } = await supabase
      .from("yiss_project_items")
      .insert({
        project: name,
        title: parsed.data.title,
        category: parsed.data.category,
        status: "pending",
        position: 0,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (itemError) throw new Error(itemError.message);

    return { ok: true, data: { project: name, item: item as YissItem } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateYissItemAction(
  input: unknown,
): Promise<ActionResult<YissItem>> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const patch: Record<string, unknown> = {};
    if (parsed.data.project !== undefined) patch.project = parsed.data.project;
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.description !== undefined)
      patch.description = parsed.data.description?.length
        ? parsed.data.description
        : null;
    if (parsed.data.category !== undefined) patch.category = parsed.data.category;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.due_date !== undefined)
      patch.due_date = parsed.data.due_date ?? null;
    if (parsed.data.link !== undefined)
      patch.link = parsed.data.link?.length ? parsed.data.link : null;

    const { data, error } = await supabase
      .from("yiss_project_items")
      .update(patch)
      .eq("id", parsed.data.id)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as YissItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function archiveYissItemAction(
  id: string,
  archive: boolean,
): Promise<ActionResult<YissItem>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { data, error } = await supabase
      .from("yiss_project_items")
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq("id", parsed.data)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as YissItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteYissItemAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { error } = await supabase
      .from("yiss_project_items")
      .delete()
      .eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function renameYissProjectAction(
  input: unknown,
): Promise<ActionResult<{ from: string; to: string; count: number }>> {
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { data, error } = await supabase
      .from("yiss_project_items")
      .update({ project: parsed.data.to })
      .eq("project", parsed.data.from)
      .select("id");
    if (error) throw new Error(error.message);

    await supabase
      .from("yiss_projects_meta")
      .update({ project: parsed.data.to })
      .eq("project", parsed.data.from);

    return {
      ok: true,
      data: {
        from: parsed.data.from,
        to: parsed.data.to,
        count: (data ?? []).length,
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteYissProjectAction(
  project: string,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { data, error } = await supabase
      .from("yiss_project_items")
      .delete()
      .eq("project", parsed.data)
      .select("id");
    if (error) throw new Error(error.message);

    await supabase
      .from("yiss_projects_meta")
      .delete()
      .eq("project", parsed.data);

    return {
      ok: true,
      data: { project: parsed.data, count: (data ?? []).length },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function archiveYissProjectAction(
  input: unknown,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = archiveProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    let q = supabase
      .from("yiss_project_items")
      .update({
        archived_at: parsed.data.archive ? new Date().toISOString() : null,
      })
      .eq("project", parsed.data.project);
    q = parsed.data.archive
      ? q.is("archived_at", null)
      : q.not("archived_at", "is", null);

    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);

    return {
      ok: true,
      data: { project: parsed.data.project, count: (data ?? []).length },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function reorderYissItemsAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = reorderItemsSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    await Promise.all(
      parsed.data.ids.map((id, idx) =>
        supabase
          .from("yiss_project_items")
          .update({ position: idx })
          .eq("id", id)
          .eq("project", parsed.data.project),
      ),
    );
    return { ok: true, data: { count: parsed.data.ids.length } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateYissMetaAction(
  input: unknown,
): Promise<ActionResult<YissProjectMeta>> {
  const parsed = metaUpdateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const patch: Record<string, unknown> = {
      project: parsed.data.project,
    };
    if (parsed.data.color !== undefined) patch.color = parsed.data.color;
    if (parsed.data.emoji !== undefined)
      patch.emoji = parsed.data.emoji?.length ? parsed.data.emoji : null;
    if (parsed.data.group !== undefined)
      patch.grp = parsed.data.group?.length ? parsed.data.group : null;

    const { data, error } = await supabase
      .from("yiss_projects_meta")
      .upsert(patch, { onConflict: "project" })
      .select(META_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as YissProjectMeta };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createYissGroupAction(
  input: unknown,
): Promise<ActionResult<YissGroup>> {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { data: maxRow } = await supabase
      .from("yiss_groups")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("yiss_groups")
      .upsert({ name: parsed.data, position }, { onConflict: "name" })
      .select("name, position")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as YissGroup };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteYissGroupAction(
  input: unknown,
): Promise<ActionResult<{ name: string }>> {
  const parsed = groupNameSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  try {
    const supabase = yissClient();
    const { error } = await supabase
      .from("yiss_groups")
      .delete()
      .eq("name", parsed.data);
    if (error) throw new Error(error.message);

    // Unassign any projects that referenced this group.
    await supabase
      .from("yiss_projects_meta")
      .update({ grp: null })
      .eq("grp", parsed.data);

    return { ok: true, data: { name: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
