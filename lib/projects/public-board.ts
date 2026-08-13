import { cache } from "react";
import { createServerClient } from "@supabase/ssr";

import {
  defaultProjectMeta,
  type ProjectColor,
  type ProjectItemCategory,
  type ProjectItemStatus,
} from "@/lib/projects/types";
import { isReservedSlug } from "@/lib/projects/slug";

export type PublicBoardItem = {
  id: string;
  project: string;
  client: string | null;
  title: string;
  description: string | null;
  category: ProjectItemCategory;
  status: ProjectItemStatus;
  due_date: string | null;
  link: string | null;
  position: number;
};

export type PublicBoardMeta = {
  project: string;
  client: string | null;
  color: ProjectColor;
  emoji: string | null;
  position: number;
};

export type PublicBoardClient = {
  name: string;
  slug: string;
  position: number;
};

export type PublicBoardProject = {
  project: string;
  meta: PublicBoardMeta;
  items: PublicBoardItem[];
};

/** One client's section. `client` is null for projects with no client set. */
export type PublicBoardGroup = {
  client: string | null;
  projects: PublicBoardProject[];
};

export type PublicBoard = {
  /** Client name for a single-client link, or a generic title for /todos. */
  title: string;
  /** True when the board spans every client (the /todos link). */
  allClients: boolean;
  groups: PublicBoardGroup[];
  itemCount: number;
};

/**
 * Anon Supabase client: no cookies, no user. The public board must render the
 * same for a logged-out client and for a signed-in team member, so we never
 * let the visitor's session reach these queries.
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

/**
 * Load a public board.
 *
 * `slug` is a client slug (`copa`) for a per-client link, or null for the
 * /todos overview. Scoping happens inside the SQL functions, so a client link
 * physically cannot return another client's rows — we never fetch them and
 * then filter in JS.
 *
 * Returns null when the slug matches no client, which the route turns into a
 * 404 so unknown links leak nothing about which clients exist.
 *
 * Wrapped in React `cache` so `generateMetadata` and the page body share one
 * round trip per request.
 */
export const loadPublicBoard = cache(async function loadPublicBoard(
  slug: string | null,
): Promise<PublicBoard | null> {
  const allClients = slug === null;

  let p_slug: string | null = null;
  if (slug !== null) {
    p_slug = slug.trim().toLowerCase();
    if (
      p_slug.length === 0 ||
      isReservedSlug(p_slug) ||
      !/^[a-z0-9][a-z0-9-]*$/.test(p_slug)
    ) {
      return null;
    }
  }

  const supabase = anonClient();

  const [clientsRes, metaRes, itemsRes] = await Promise.all([
    supabase.rpc("get_public_board_clients", { p_slug }),
    supabase.rpc("get_public_board_meta", { p_slug }),
    supabase.rpc("get_public_board_items", { p_slug }),
  ]);

  if (clientsRes.error || metaRes.error || itemsRes.error) return null;

  const clients = (clientsRes.data ?? []) as PublicBoardClient[];

  // A per-client link is only valid if the slug resolves to a client.
  if (!allClients && clients.length === 0) return null;

  const metaRows = (metaRes.data ?? []) as PublicBoardMeta[];
  const items = (itemsRes.data ?? []) as PublicBoardItem[];

  const metaByProject = new Map<string, PublicBoardMeta>();
  for (const m of metaRows) metaByProject.set(m.project, m);

  // Bucket items into their project, keeping the order the SQL returned.
  const itemsByProject = new Map<string, PublicBoardItem[]>();
  for (const item of items) {
    const bucket = itemsByProject.get(item.project);
    if (bucket) bucket.push(item);
    else itemsByProject.set(item.project, [item]);
  }

  // Every project that should appear: those with metadata (so empty projects
  // still show up) plus any project that only exists through its items.
  const projectNames = new Set<string>([
    ...metaRows.map((m) => m.project),
    ...itemsByProject.keys(),
  ]);

  const projects: PublicBoardProject[] = Array.from(projectNames)
    .map((project) => {
      const stored = metaByProject.get(project);
      const meta: PublicBoardMeta = stored ?? {
        ...defaultProjectMeta(project),
        client: itemsByProject.get(project)?.[0]?.client ?? null,
      };
      return { project, meta, items: itemsByProject.get(project) ?? [] };
    })
    .sort(
      (a, b) =>
        a.meta.position - b.meta.position ||
        a.project.localeCompare(b.project, "es"),
    );

  const clientOrder = new Map<string, number>();
  clients.forEach((c) => clientOrder.set(c.name, c.position));

  const byClient = new Map<string | null, PublicBoardProject[]>();
  for (const project of projects) {
    const key = project.meta.client ?? null;
    const bucket = byClient.get(key);
    if (bucket) bucket.push(project);
    else byClient.set(key, [project]);
  }

  const groups: PublicBoardGroup[] = Array.from(byClient.entries())
    .map(([client, projectList]) => ({ client, projects: projectList }))
    .sort((a, b) => {
      // Projects with no client go last; the rest follow the board's own
      // client order.
      if (a.client === null) return 1;
      if (b.client === null) return -1;
      const pa = clientOrder.get(a.client) ?? Number.MAX_SAFE_INTEGER;
      const pb = clientOrder.get(b.client) ?? Number.MAX_SAFE_INTEGER;
      return pa - pb || a.client.localeCompare(b.client, "es");
    });

  return {
    title: allClients ? "Todos los clientes" : (clients[0]?.name ?? ""),
    allClients,
    groups,
    itemCount: items.length,
  };
});
