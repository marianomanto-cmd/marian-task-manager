import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicMasterView } from "@/components/timeliner/public-master-view";
import { loadPublicMaster } from "@/lib/timeliner/public";

/**
 * Public MASTER link: `/m/<token>`. The hitos of every timeline on one
 * read-only page that keeps itself current — the Timeliner counterpart of the
 * projects board's `/todos`, and like it, meant for the team: it spans every
 * project, so it is not a client link.
 *
 * The token is resolved server-side by the SQL functions from migration 0031;
 * an unknown or revoked token 404s and leaks nothing about what exists.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "MASTER · Timeliner",
  // Link-only: keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function PublicMasterPage({ params }: Params) {
  const { token } = await params;
  const data = await loadPublicMaster(token);
  if (!data) notFound();

  return <PublicMasterView token={token.toLowerCase()} initial={data} />;
}
