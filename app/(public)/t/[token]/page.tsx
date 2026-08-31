import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicTimelineView } from "@/components/timeliner/public-timeline-view";
import { loadPublicTimeline } from "@/lib/timeliner/public";

/**
 * Public timeline link: `/t/<token>`. Anyone with the link sees that one
 * timeline — read-only, no login — and the view keeps itself current, so a
 * client can leave it open while the team moves bars around.
 *
 * The token is resolved server-side by the SQL functions from migration 0029;
 * an unknown or revoked token 404s and leaks nothing about what exists.
 */

// A share link must reflect the timeline as it stands right now, never a
// cached snapshot from an earlier visitor.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicTimeline(token);
  return {
    title: data ? `${data.timeline.name} · Timeline` : "Timeline",
    // Link-only: keep shared timelines out of search results.
    robots: { index: false, follow: false },
  };
}

export default async function PublicTimelinePage({ params }: Params) {
  const { token } = await params;
  const data = await loadPublicTimeline(token);
  if (!data) notFound();

  return <PublicTimelineView token={token.toLowerCase()} initial={data} />;
}
