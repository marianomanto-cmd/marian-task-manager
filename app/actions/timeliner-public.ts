"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/actions/result";
import { loadPublicMaster, loadPublicTimeline } from "@/lib/timeliner/public";
import type {
  PublicMasterData,
  PublicTimelineData,
} from "@/lib/timeliner/types";

/**
 * Refresh endpoint for a share link. The public view polls this so a client
 * watching `/t/<token>` sees the team's edits without reloading; it reads the
 * same token-scoped SQL functions as the initial server render, so it can't
 * return anything the link doesn't already grant.
 */
export async function getPublicTimelineAction(
  token: unknown,
): Promise<ActionResult<PublicTimelineData>> {
  const parsed = z.string().uuid().safeParse(token);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input", message: "Link inválido" };
  }

  try {
    const data = await loadPublicTimeline(parsed.data);
    if (!data) {
      return {
        ok: false,
        code: "forbidden",
        message: "Este link ya no está disponible.",
      };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      code: "unknown",
      message: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/** Refresh endpoint for the MASTER share link, same contract as above. */
export async function getPublicMasterAction(
  token: unknown,
): Promise<ActionResult<PublicMasterData>> {
  const parsed = z.string().uuid().safeParse(token);
  if (!parsed.success) {
    return { ok: false, code: "invalid_input", message: "Link inválido" };
  }

  try {
    const data = await loadPublicMaster(parsed.data);
    if (!data) {
      return {
        ok: false,
        code: "forbidden",
        message: "Este link ya no está disponible.",
      };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      code: "unknown",
      message: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}
