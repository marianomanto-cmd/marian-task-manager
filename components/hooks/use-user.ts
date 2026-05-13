"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

export type SessionUser = {
  id: string;
  email: string | null;
};

/**
 * Client-side hook that returns the current authenticated user. RLS-safe;
 * mostly used to gate "delete my own comment" affordances. Cached for the
 * session — auth state is stable on each route.
 */
export function useCurrentUser(): UseQueryResult<SessionUser | null> {
  return useQuery({
    queryKey: ["current-user"],
    staleTime: Infinity,
    queryFn: async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
      } satisfies SessionUser;
    },
  });
}
