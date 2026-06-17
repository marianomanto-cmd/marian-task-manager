"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { type Brief, BRIEF_DB_COLUMNS } from "@/lib/briefs/types";
import { createClient } from "@/lib/supabase/server";

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
        message: "Iniciá sesión para ver los briefs.",
      },
    };
  }
  return { ok: true, userId: user.id };
}

const field = z.string().max(8000);
const patchSchema = z
  .object({
    campaign_name: field,
    start_date: field,
    end_date: field,
    markets: field,
    objective: field,
    investment: field,
    kpi: field,
    kpi_goals: field,
    link: field,
    background: field,
    target_audience: field,
    social_networks: field,
  })
  .partial();
const updateSchema = z.object({ id: z.string().uuid(), patch: patchSchema });

export async function getBriefsAction(): Promise<ActionResult<Brief[]>> {
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("briefs")
      .select(BRIEF_DB_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { ok: true, data: (data ?? []) as Brief[] };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function updateBriefAction(
  input: unknown,
): Promise<ActionResult<Brief>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("briefs")
      .update(parsed.data.patch)
      .eq("id", parsed.data.id)
      .select(BRIEF_DB_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, data: data as Brief };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteBriefAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("briefs").delete().eq("id", parsed.data);
    if (error) throw new Error(error.message);
    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
