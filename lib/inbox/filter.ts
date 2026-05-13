import type { EmailAiCategory } from "@/lib/gmail/types";

export type InboxFilter = {
  archived: boolean;
  readState?: "unread" | "read";
  categories?: EmailAiCategory[];
  /** Substring match against email_ai.campaign_code. */
  campaignCode?: string;
};

export type SavedFilter = {
  id: string;
  user_id: string;
  name: string;
  criteria: InboxFilter;
  created_at: string;
};

/**
 * Strips empty/default fields so the saved jsonb stays minimal and two
 * equivalent filters serialize the same way (used for "active filter
 * matches saved one" comparisons).
 */
export function normalizeFilter(filter: InboxFilter): InboxFilter {
  const out: InboxFilter = { archived: filter.archived };
  if (filter.readState) out.readState = filter.readState;
  if (filter.categories && filter.categories.length > 0) {
    out.categories = [...filter.categories].sort();
  }
  if (filter.campaignCode && filter.campaignCode.trim().length > 0) {
    out.campaignCode = filter.campaignCode.trim();
  }
  return out;
}

export function filtersAreEqual(a: InboxFilter, b: InboxFilter): boolean {
  return JSON.stringify(normalizeFilter(a)) === JSON.stringify(normalizeFilter(b));
}
