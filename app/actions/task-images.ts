"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "task-images";
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 60; // 1h — the list query refetches well within this.

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export type TaskImageView = {
  id: string;
  url: string;
  mime: string | null;
  created_at: string;
};

const idSchema = z.string().uuid();

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
        message: "Iniciá sesión para gestionar imágenes.",
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

async function signRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: { id: string; storage_path: string; mime: string | null; created_at: string },
): Promise<TaskImageView | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
  if (!data?.signedUrl) return null;
  return {
    id: row.id,
    url: data.signedUrl,
    mime: row.mime,
    created_at: row.created_at,
  };
}

export async function listTaskImagesAction(
  taskId: string,
): Promise<ActionResult<TaskImageView[]>> {
  const parsed = idSchema.safeParse(taskId);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("task_images")
      .select("id, storage_path, mime, created_at")
      .eq("task_id", parsed.data)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const views = await Promise.all((data ?? []).map((r) => signRow(supabase, r)));
    return { ok: true, data: views.filter((v): v is TaskImageView => v !== null) };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function uploadTaskImageAction(
  formData: FormData,
): Promise<ActionResult<TaskImageView>> {
  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  const taskId = formData.get("taskId");
  const file = formData.get("file");

  const parsedId = idSchema.safeParse(taskId);
  if (!parsedId.success) return asInvalid("Tarea inválida.");
  if (!(file instanceof File)) return asInvalid("Falta el archivo.");
  if (file.size === 0 || file.size > MAX_BYTES) {
    return asInvalid("La imagen supera los 10 MB.");
  }
  const ext = MIME_EXT[file.type];
  if (!ext) return asInvalid("Formato no soportado (usá PNG, JPG, GIF o WebP).");

  try {
    const supabase = await createClient();
    const path = `${parsedId.data}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: row, error: insertErr } = await supabase
      .from("task_images")
      .insert({
        task_id: parsedId.data,
        storage_path: path,
        mime: file.type,
        created_by: auth.userId,
      })
      .select("id, storage_path, mime, created_at")
      .single();
    if (insertErr || !row) {
      // Roll back the orphaned object so storage doesn't drift from the table.
      await supabase.storage.from(BUCKET).remove([path]);
      throw new Error(insertErr?.message ?? "No se pudo registrar la imagen.");
    }

    const view = await signRow(supabase, row);
    if (!view) throw new Error("No se pudo firmar la URL de la imagen.");
    return { ok: true, data: view };
  } catch (err) {
    return asUnknown(err);
  }
}

export async function deleteTaskImageAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return asInvalid(parsed.error.message);

  const auth = await requireUser();
  if (!auth.ok) return auth.result;

  try {
    const supabase = await createClient();
    const { data: row, error: readErr } = await supabase
      .from("task_images")
      .select("storage_path")
      .eq("id", parsed.data)
      .single();
    if (readErr) throw new Error(readErr.message);

    await supabase.storage.from(BUCKET).remove([row.storage_path as string]);

    const { error: delErr } = await supabase
      .from("task_images")
      .delete()
      .eq("id", parsed.data);
    if (delErr) throw new Error(delErr.message);

    return { ok: true, data: { id: parsed.data } };
  } catch (err) {
    return asUnknown(err);
  }
}
