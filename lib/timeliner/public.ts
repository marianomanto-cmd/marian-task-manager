import { cache } from "react";
import { createServerClient } from "@supabase/ssr";

import type {
  Holiday,
  PublicTimeline,
  PublicTimelineData,
  TimelineGroup,
  TimelineItem,
} from "@/lib/timeliner/types";

/**
 * Read side of a Timeliner share link (`/t/<token>`).
 *
 * The timeliner tables are RLS-locked to agency members, so everything here
 * goes through the SECURITY DEFINER functions from migration 0029: they take
 * the token, resolve it to exactly one timeline in SQL, and return only that
 * timeline's rows. A link therefore can't reach another timeline, and an
 * unknown or revoked token returns nothing at all (the route 404s).
 */

/**
 * Anon Supabase client: no cookies, no user. The shared view has to render the
 * same for a logged-out client and for a signed-in team member, so the
 * visitor's session never reaches these queries.
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

export function isShareToken(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Load the timeline behind a share token, or null when the token is malformed,
 * unknown or revoked. Wrapped in React `cache` so `generateMetadata` and the
 * page body share one round trip per request.
 */
export const loadPublicTimeline = cache(async function loadPublicTimeline(
  token: string,
): Promise<PublicTimelineData | null> {
  if (!isShareToken(token)) return null;

  const supabase = anonClient();
  const p_token = token.toLowerCase();

  const [timelineRes, groupsRes, itemsRes, holidaysRes] = await Promise.all([
    supabase.rpc("get_public_timeline", { p_token }),
    supabase.rpc("get_public_timeline_groups", { p_token }),
    supabase.rpc("get_public_timeline_items", { p_token }),
    supabase.rpc("get_public_timeline_holidays", { p_token }),
  ]);

  if (timelineRes.error) return null;

  const timeline = ((timelineRes.data ?? []) as PublicTimeline[])[0];
  // No row = the token matches no timeline: revoked, rotated, or made up.
  if (!timeline) return null;

  if (groupsRes.error || itemsRes.error) return null;

  return {
    timeline,
    groups: (groupsRes.data ?? []) as TimelineGroup[],
    items: (itemsRes.data ?? []) as TimelineItem[],
    // Holidays are decoration: if that read fails the timeline still renders.
    holidays: holidaysRes.error ? [] : ((holidaysRes.data ?? []) as Holiday[]),
    fetched_at: new Date().toISOString(),
  };
});
