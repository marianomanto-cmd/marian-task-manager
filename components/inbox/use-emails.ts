"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  getLastSyncAction,
  listEmailsAction,
  type LastSyncSummary,
  type ListEmailsInput,
} from "@/app/actions/emails";
import type { Email } from "@/lib/gmail/types";
import { createClient } from "@/lib/supabase/client";

export type EmailsQueryResult =
  | { emails: Email[]; authRequired: false; error: null }
  | { emails: []; authRequired: true; error: string }
  | { emails: []; authRequired: false; error: string };

export function emailsQueryKey(filter: ListEmailsInput) {
  return [
    "emails",
    filter.archived === undefined ? "all" : filter.archived ? "archived" : "active",
    filter.limit ?? 100,
  ] as const;
}

export const EMAILS_INVALIDATION_KEY = ["emails"] as const;
export const SYNC_LOG_INVALIDATION_KEY = ["last-sync"] as const;
export const PENDING_AI_INVALIDATION_KEY = ["pending-ai"] as const;

export function useEmails(
  filter: ListEmailsInput = {},
): UseQueryResult<EmailsQueryResult> {
  return useQuery({
    queryKey: emailsQueryKey(filter),
    staleTime: 30_000,
    queryFn: async (): Promise<EmailsQueryResult> => {
      const result = await listEmailsAction(filter);
      if (result.ok) {
        return { emails: result.data, authRequired: false, error: null };
      }
      if (result.code === "auth_required") {
        return { emails: [], authRequired: true, error: result.message };
      }
      return { emails: [], authRequired: false, error: result.message };
    },
  });
}

export function useLastSync(): UseQueryResult<LastSyncSummary | null> {
  return useQuery({
    queryKey: SYNC_LOG_INVALIDATION_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await getLastSyncAction();
      if (!result.ok) return null;
      return result.data;
    },
  });
}

/**
 * Reads the count of emails not yet classified by Claude — drives the
 * "Analizar (N)" button. RLS scopes it to the current user automatically.
 */
export function usePendingAiCount(): UseQueryResult<number> {
  return useQuery({
    queryKey: PENDING_AI_INVALIDATION_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient();
      const { count, error } = await supabase
        .from("emails")
        .select("id", { count: "exact", head: true })
        .not("id", "in", `(select email_id from email_ai)`);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}
