import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicBoardView } from "@/components/public/public-board-view";
import { loadPublicBoard } from "@/lib/projects/public-board";

/**
 * Public per-client board: `/copa`, `/cmi`, … Anyone with the link sees that
 * client's projects and tasks, and nothing else — the slug is resolved
 * server-side and the query is scoped to it in SQL.
 *
 * This is the app's catch-all root segment, so it only ever runs for paths
 * that don't match a real route (`/tasks`, `/projects`, `/todos`, `/p/…` are
 * all static and win over it). Unknown slugs 404.
 */

// Client links must reflect the board as it stands right now, never a cached
// snapshot from an earlier visitor.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const board = await loadPublicBoard(slug);
  return {
    title: board ? `${board.title} · Board` : "Board",
    // Client boards are link-only: keep them out of search results.
    robots: { index: false, follow: false },
  };
}

export default async function ClientBoardPage({ params }: Params) {
  const { slug } = await params;
  const board = await loadPublicBoard(slug);
  if (!board) notFound();
  return <PublicBoardView board={board} />;
}
