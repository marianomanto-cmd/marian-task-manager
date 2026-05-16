import { createServerClient } from "@supabase/ssr";

import type {
  ProjectColor,
  ProjectItemCategory,
  ProjectItemStatus,
  ProjectMeta,
} from "@/lib/projects/types";

export type SharedProjectItem = {
  id: string;
  project: string;
  title: string;
  description: string | null;
  category: ProjectItemCategory;
  status: ProjectItemStatus;
  due_date: string | null;
  link: string | null;
  position: number;
};

export type SharedBoardData = {
  items: SharedProjectItem[];
  meta: ProjectMeta[];
};

/**
 * Build an anon Supabase client (no cookies, no user). Used by the public
 * share route — we don't want to leak the visitor's session into RLS.
 */
function anonClient() {
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

export async function loadSharedBoard(
  token: string,
): Promise<SharedBoardData | null> {
  if (!isUuid(token)) return null;

  const supabase = anonClient();

  const [items, meta] = await Promise.all([
    supabase.rpc("get_shared_projects", { token }),
    supabase.rpc("get_shared_projects_meta", { token }),
  ]);

  if (items.error) return null;

  const rows = (items.data ?? []) as SharedProjectItem[];
  const metaRows = (meta.error ? [] : ((meta.data ?? []) as Array<{
    project: string;
    color: ProjectColor;
    emoji: string | null;
    position: number;
  }>));

  // Empty items + empty meta = the token doesn't match any user. The RPC
  // returns rows for anyone with items; if the token is invalid we get [].
  // We can't reliably distinguish "valid token, no items yet" from "bad
  // token" without an extra query, so treat both as 404.
  if (rows.length === 0 && metaRows.length === 0) return null;

  return { items: rows, meta: metaRows };
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v,
  );
}
