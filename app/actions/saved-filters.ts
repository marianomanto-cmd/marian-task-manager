"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import type { InboxFilter, SavedFilter } from "@/lib/inbox/filter";
import { createClient } from "@/lib/supabase/server";

const criteriaSchema = z.object({
  archived: z.boolean(),
  readState: z.enum(["unread", "read"]).optional(),
  categories: z
    .array(
      z.enum([
        "URGENTE",
        "CLIENTE",
        "PROVEEDOR",
        "INTERNO",
        "INFORMATIVO",
        "OTROS",
      ]),
    )
    .optional(),
  campaignCode: z.string().trim().max(200).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre").max(80),
  criteria: criteriaSchema,
});

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; result: ActionResult<never> }
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
        message: "Iniciá sesión para gestionar filtros guardados.",
      },
    };
  }
  return { ok: true, userId: user.id };
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

function normalizeRow(raw: unknown): SavedFilter {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    user_id: r.user_id as string,
    name: r.name as string,
    criteria: (r.criteria as InboxFilter) ?? { archived: false },
    created_at: r.created_at as string,
  };
}

export async function listSavedFiltersAction(): Promise<
  ActionResult<SavedFilter[]>
> {
  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("saved_filters")
      .select("id, user_id, name, criteria, created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []).map(normalizeRow) };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createSavedFilterAction(
  input: unknown,
): Promise<ActionResult<SavedFilter>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("saved_filters")
      .insert({
        user_id: auth.userId,
        name: parsed.data.name,
        criteria: parsed.data.criteria,
      })
      .select("id, user_id, name, criteria, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: normalizeRow(data) };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteSavedFilterAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const idSchema = z.string().uuid();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("saved_filters")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", auth.userId);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
