import { notFound } from "next/navigation";

import { PublicBoardView } from "@/components/public/public-board-view";
import { loadPublicBoard } from "@/lib/projects/public-board";

/**
 * `/todos` — the same read-only view as a client link, but spanning every
 * client. Meant for the team and for whoever needs the whole picture; the
 * per-client links stay isolated from each other.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Todos los clientes · Board",
  robots: { index: false, follow: false },
};

export default async function AllClientsBoardPage() {
  const board = await loadPublicBoard(null);
  if (!board) notFound();
  return <PublicBoardView board={board} />;
}
