"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { isAdminEmail } from "@/lib/auth/admin";
import {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  checkSlug,
  isReservedSlug,
  slugify,
} from "@/lib/projects/slug";
import {
  PROJECT_COLORS,
  PROJECT_ITEM_CATEGORIES,
  PROJECT_ITEM_STATUSES,
  pickStableColor,
  type Client,
  type ProjectColor,
  type ProjectItem,
  type ProjectItemCategory,
  type ProjectItemStatus,
  type ProjectMeta,
} from "@/lib/projects/types";
import { createClient } from "@/lib/supabase/server";

const SELECT_COLUMNS = `
  id, user_id, project, title, description, category, status,
  due_date, link, position, archived_at, created_at, updated_at
`;

const categorySchema = z.enum(
  PROJECT_ITEM_CATEGORIES as readonly [
    ProjectItemCategory,
    ...ProjectItemCategory[],
  ],
);
const statusSchema = z.enum(
  PROJECT_ITEM_STATUSES as readonly [ProjectItemStatus, ...ProjectItemStatus[]],
);
const colorSchema = z.enum(
  PROJECT_COLORS as readonly [ProjectColor, ...ProjectColor[]],
);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");
const linkSchema = z.string().trim().max(2000);
const projectSchema = z.string().trim().min(1, "Falta el proyecto").max(120);
const titleSchema = z.string().trim().min(1, "Falta la tarea").max(500);
const descriptionSchema = z.string().trim().max(4000);

const archiveModeSchema = z.enum(["active", "archive"]).default("active");

const listSchema = z.object({
  archiveMode: archiveModeSchema.optional(),
});

const createSchema = z.object({
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
  client: z.string().trim().max(120).nullable().optional(),
  title: titleSchema,
  category: categorySchema.default("otros"),
});

const updateSchema = z.object({
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

const reorderItemsSchema = z.object({
  project: projectSchema,
  ids: z.array(z.string().uuid()).max(500),
});

const reorderProjectsSchema = z.object({
  projects: z.array(projectSchema).max(200),
});

const metaUpdateSchema = z.object({
  project: projectSchema,
  color: colorSchema.optional(),
  emoji: z.string().trim().max(8).nullable().optional(),
  client: z.string().trim().max(120).nullable().optional(),
});

const clientNameSchema = z
  .string()
  .trim()
  .min(1, "Falta el nombre del cliente")
  .max(120);

const clientSlugSchema = z.object({
  name: clientNameSchema,
  slug: z.string().trim().max(SLUG_MAX_LENGTH),
});

export type ListProjectItemsInput = z.infer<typeof listSchema>;
export type CreateProjectItemInput = z.infer<typeof createSchema>;
export type UpdateProjectItemInput = z.infer<typeof updateSchema>;

async function requireAdmin(): Promise<
  | { ok: true; userId: string; email: string }
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
        message: "Iniciá sesión para administrar el board.",
      },
    };
  }
  if (!isAdminEmail(user.email)) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "forbidden",
        message: "Sólo Mariano puede editar el board de proyectos.",
      },
    };
  }
  return { ok: true, userId: user.id, email: user.email! };
}

async function requireReader(): Promise<
  | { ok: true; userId: string; isAdmin: boolean }
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
        message: "Iniciá sesión para ver el board.",
      },
    };
  }
  return { ok: true, userId: user.id, isAdmin: isAdminEmail(user.email) };
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

export type ProjectBoardData = {
  items: ProjectItem[];
  meta: ProjectMeta[];
  clients: Client[];
};

export async function listProjectBoardAction(
  input: ListProjectItemsInput = {},
): Promise<ActionResult<ProjectBoardData>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireReader();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    let itemsQuery = supabase
      .from("project_items")
      .select(SELECT_COLUMNS)
      .order("project", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    const archiveMode = parsed.data.archiveMode ?? "active";
    if (archiveMode === "active") {
      itemsQuery = itemsQuery.is("archived_at", null);
    } else {
      itemsQuery = itemsQuery.not("archived_at", "is", null);
    }

    const [itemsRes, metaRes, clientsRes] = await Promise.all([
      itemsQuery,
      supabase
        .from("projects_meta")
        .select("project, color, emoji, client, position")
        .order("position", { ascending: true })
        .order("project", { ascending: true }),
      supabase
        .from("clients")
        .select("name, position, slug")
        .order("position", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (metaRes.error) throw new Error(metaRes.error.message);
    if (clientsRes.error) throw new Error(clientsRes.error.message);

    return {
      ok: true,
      data: {
        items: (itemsRes.data ?? []) as ProjectItem[],
        meta: (metaRes.data ?? []) as ProjectMeta[],
        clients: (clientsRes.data ?? []) as Client[],
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createProjectItemAction(
  input: unknown,
): Promise<ActionResult<ProjectItem>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: maxRow } = await supabase
      .from("project_items")
      .select("position")
      .eq("user_id", auth.userId)
      .eq("project", parsed.data.project)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from("project_items")
      .insert({
        user_id: auth.userId,
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
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as ProjectItem };
  } catch (err) {
    return asUnknown(err);
  }
}

/**
 * Creates a project (a `projects_meta` row) together with its first task, so
 * the board never ends up with empty, hidden projects. The optional `client`
 * ties the project to a client up front, replacing the old flow where you had
 * to assign the client separately after the fact.
 */
export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<{ project: string; item: ProjectItem }>> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const name = parsed.data.name;

    // A project is identified by its name, so reject duplicates whether they
    // already exist as a meta row or only as items.
    const [existingMeta, existingItem] = await Promise.all([
      supabase
        .from("projects_meta")
        .select("project")
        .eq("user_id", auth.userId)
        .eq("project", name)
        .maybeSingle(),
      supabase
        .from("project_items")
        .select("id")
        .eq("user_id", auth.userId)
        .eq("project", name)
        .limit(1)
        .maybeSingle(),
    ]);
    if (existingMeta.data || existingItem.data)
      return asInvalid(`Ya existe un proyecto llamado "${name}".`);

    const { data: maxRow } = await supabase
      .from("projects_meta")
      .select("position")
      .eq("user_id", auth.userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    const client = parsed.data.client?.length ? parsed.data.client : null;
    const { error: metaError } = await supabase.from("projects_meta").insert({
      user_id: auth.userId,
      project: name,
      color: pickStableColor(name),
      emoji: null,
      client,
      position,
    });
    if (metaError) throw new Error(metaError.message);

    const { data: item, error: itemError } = await supabase
      .from("project_items")
      .insert({
        user_id: auth.userId,
        project: name,
        title: parsed.data.title,
        category: parsed.data.category,
        status: "pending",
        position: 0,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (itemError) throw new Error(itemError.message);

    return { ok: true, data: { project: name, item: item as ProjectItem } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateProjectItemAction(
  input: unknown,
): Promise<ActionResult<ProjectItem>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
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
      .from("project_items")
      .update(patch)
      .eq("id", parsed.data.id)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as ProjectItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function archiveProjectItemAction(
  id: string,
  archive: boolean,
): Promise<ActionResult<ProjectItem>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_items")
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq("id", parsed.data)
      .eq("user_id", auth.userId)
      .select(SELECT_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as ProjectItem };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteProjectItemAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("project_items")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", auth.userId);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function renameProjectAction(
  input: unknown,
): Promise<ActionResult<{ from: string; to: string; count: number }>> {
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_items")
      .update({ project: parsed.data.to })
      .eq("user_id", auth.userId)
      .eq("project", parsed.data.from)
      .select("id");
    if (error) throw new Error(error.message);

    await supabase
      .from("projects_meta")
      .update({ project: parsed.data.to })
      .eq("user_id", auth.userId)
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

export async function deleteProjectAction(
  project: string,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = projectSchema.safeParse(project);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("project_items")
      .delete()
      .eq("user_id", auth.userId)
      .eq("project", parsed.data)
      .select("id");
    if (error) throw new Error(error.message);

    await supabase
      .from("projects_meta")
      .delete()
      .eq("user_id", auth.userId)
      .eq("project", parsed.data);

    return {
      ok: true,
      data: { project: parsed.data, count: (data ?? []).length },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

const archiveProjectSchema = z.object({
  project: projectSchema,
  archive: z.boolean(),
});

/**
 * Archives (or reactivates) a whole project by flipping `archived_at` on all
 * of its items. Archived projects drop out of the active board and show up in
 * the Archive view, so projects can be retired as they wrap up.
 */
export async function archiveProjectAction(
  input: unknown,
): Promise<ActionResult<{ project: string; count: number }>> {
  const parsed = archiveProjectSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    let q = supabase
      .from("project_items")
      .update({
        archived_at: parsed.data.archive ? new Date().toISOString() : null,
      })
      .eq("user_id", auth.userId)
      .eq("project", parsed.data.project);
    // Only touch the rows that are in the opposite state, so reactivating a
    // project doesn't disturb timestamps and stays idempotent.
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

export async function reorderProjectItemsAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = reorderItemsSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    await Promise.all(
      parsed.data.ids.map((id, idx) =>
        supabase
          .from("project_items")
          .update({ position: idx })
          .eq("id", id)
          .eq("user_id", auth.userId)
          .eq("project", parsed.data.project),
      ),
    );
    return { ok: true, data: { count: parsed.data.ids.length } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function reorderProjectsAction(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  const parsed = reorderProjectsSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    await Promise.all(
      parsed.data.projects.map((project, idx) =>
        supabase
          .from("projects_meta")
          .upsert(
            { user_id: auth.userId, project, position: idx },
            { onConflict: "user_id,project" },
          ),
      ),
    );
    return { ok: true, data: { count: parsed.data.projects.length } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateProjectMetaAction(
  input: unknown,
): Promise<ActionResult<ProjectMeta>> {
  const parsed = metaUpdateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = {
      user_id: auth.userId,
      project: parsed.data.project,
    };
    if (parsed.data.color !== undefined) patch.color = parsed.data.color;
    if (parsed.data.emoji !== undefined)
      patch.emoji = parsed.data.emoji?.length ? parsed.data.emoji : null;
    if (parsed.data.client !== undefined)
      patch.client = parsed.data.client?.length ? parsed.data.client : null;

    const { data, error } = await supabase
      .from("projects_meta")
      .upsert(patch, { onConflict: "user_id,project" })
      .select("project, color, emoji, client, position")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as ProjectMeta };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function listClientsAction(): Promise<ActionResult<Client[]>> {
  const auth = await requireReader();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clients")
      .select("name, position, slug")
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as Client[] };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createClientAction(
  input: unknown,
): Promise<ActionResult<Client>> {
  const parsed = clientNameSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: maxRow } = await supabase
      .from("clients")
      .select("position")
      .eq("user_id", auth.userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (maxRow?.position ?? -1) + 1;

    // This is an upsert, so it also runs for a client that already exists.
    // Keep the slug it already has — it may be in a link the client is using.
    const { data: existing } = await supabase
      .from("clients")
      .select("slug")
      .eq("user_id", auth.userId)
      .eq("name", parsed.data)
      .maybeSingle();
    const slug =
      (existing?.slug as string | null) ??
      (await nextFreeSlug(supabase, parsed.data));

    const { data, error } = await supabase
      .from("clients")
      .upsert(
        { user_id: auth.userId, name: parsed.data, position, slug },
        { onConflict: "user_id,name" },
      )
      .select("name, position, slug")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Client };
  } catch (err) {
    return asUnknown(err);
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Pick a free public slug for a new client. Prefers the short first word
 * ("Copa Airlines" -> copa) and falls back to the full name, then to a
 * numeric suffix — same order the migration used when backfilling, so links
 * created later look like the ones created on day one.
 */
async function nextFreeSlug(
  supabase: SupabaseClient,
  name: string,
): Promise<string> {
  let base = slugify(name.split(" ")[0] ?? "");
  if (base.length < SLUG_MIN_LENGTH || isReservedSlug(base)) {
    base = slugify(name);
  }
  if (base.length < SLUG_MIN_LENGTH) base = "board";
  base = base.slice(0, SLUG_MAX_LENGTH);

  const { data } = await supabase.from("clients").select("slug");
  const taken = new Set(
    ((data ?? []) as { slug: string | null }[])
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug)),
  );

  let candidate = base;
  let n = 1;
  while (taken.has(candidate) || isReservedSlug(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

/**
 * Change a client's public link. The unique index on `clients.slug` is the
 * real guard against collisions; the pre-check just turns the race we lose
 * into a readable message instead of a Postgres error.
 */
export async function updateClientSlugAction(
  input: unknown,
): Promise<ActionResult<Client>> {
  const parsed = clientSlugSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  const check = checkSlug(parsed.data.slug);
  if (!check.ok) return asInvalid(check.message);

  try {
    const supabase = await createClient();

    const { data: clash } = await supabase
      .from("clients")
      .select("name")
      .eq("slug", check.slug)
      .neq("name", parsed.data.name)
      .maybeSingle();
    if (clash) {
      return asInvalid(`El link "/${check.slug}" ya lo usa otro cliente`);
    }

    const { data, error } = await supabase
      .from("clients")
      .update({ slug: check.slug })
      .eq("user_id", auth.userId)
      .eq("name", parsed.data.name)
      .select("name, position, slug")
      .single();
    if (error) {
      if (error.code === "23505") {
        return asInvalid(`El link "/${check.slug}" ya está en uso`);
      }
      throw new Error(error.message);
    }
    return { ok: true, data: data as Client };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteClientAction(
  input: unknown,
): Promise<ActionResult<{ name: string }>> {
  const parsed = clientNameSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .delete()
      .eq("user_id", auth.userId)
      .eq("name", parsed.data);
    if (error) throw new Error(error.message);

    // Unassign any projects that referenced this client.
    await supabase
      .from("projects_meta")
      .update({ client: null })
      .eq("user_id", auth.userId)
      .eq("client", parsed.data);

    return { ok: true, data: { name: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}

export type ShareTokenResult = { token: string | null };

export async function getShareTokenAction(): Promise<
  ActionResult<ShareTokenResult>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("projects_share_token")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      ok: true,
      data: {
        token: (data?.projects_share_token as string | null) ?? null,
      },
    };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function rotateShareTokenAction(): Promise<
  ActionResult<ShareTokenResult>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const token = crypto.randomUUID();
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: auth.userId, projects_share_token: token },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, data: { token } };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function revokeShareTokenAction(): Promise<
  ActionResult<ShareTokenResult>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: auth.userId, projects_share_token: null },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, data: { token: null } };
  } catch (err) {
    return asUnknown(err);
  }
}
