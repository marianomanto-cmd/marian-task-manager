"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import type { OooEntry } from "@/lib/ooo/types";
import { createClient } from "@/lib/supabase/server";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato YYYY-MM-DD");

const baseInputSchema = z.object({
  member_name: z
    .string()
    .trim()
    .min(1, "El nombre no puede estar vacío")
    .max(200),
  start_date: dateSchema,
  end_date: dateSchema,
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

const createSchema = baseInputSchema.refine(
  (v) => v.end_date >= v.start_date,
  { path: ["end_date"], message: "La fecha de fin debe ser ≥ inicio" },
);

const updateSchema = baseInputSchema
  .extend({
    id: z.string().uuid(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "La fecha de fin debe ser ≥ inicio",
  });

const listSchema = z.object({
  rangeStart: dateSchema,
  rangeEnd: dateSchema,
});

export type CreateOooInput = z.infer<typeof createSchema>;
export type UpdateOooInput = z.infer<typeof updateSchema>;

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
        message: "Iniciá sesión para gestionar OOO.",
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

export async function listOooAction(input: {
  rangeStart: string;
  rangeEnd: string;
}): Promise<ActionResult<OooEntry[]>> {
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    // Overlap: entry.start_date <= rangeEnd AND entry.end_date >= rangeStart
    const { data, error } = await supabase
      .from("ooo_entries")
      .select("id, user_id, member_name, start_date, end_date, reason, created_at, updated_at")
      .lte("start_date", parsed.data.rangeEnd)
      .gte("end_date", parsed.data.rangeStart)
      .order("start_date", { ascending: true });

    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as OooEntry[] };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function createOooAction(
  input: unknown,
): Promise<ActionResult<OooEntry>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ooo_entries")
      .insert({
        user_id: auth.userId,
        member_name: parsed.data.member_name,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        reason: parsed.data.reason,
      })
      .select("id, user_id, member_name, start_date, end_date, reason, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, data: data as OooEntry };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateOooAction(
  input: unknown,
): Promise<ActionResult<OooEntry>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUserId();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ooo_entries")
      .update({
        member_name: parsed.data.member_name,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        reason: parsed.data.reason,
      })
      .eq("id", parsed.data.id)
      // RLS already enforces owner; redundant filter is cheap insurance.
      .eq("user_id", auth.userId)
      .select("id, user_id, member_name, start_date, end_date, reason, created_at, updated_at")
      .single();

    if (error) throw new Error(error.message);
    return { ok: true, data: data as OooEntry };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteOooAction(
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
      .from("ooo_entries")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", auth.userId);

    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
