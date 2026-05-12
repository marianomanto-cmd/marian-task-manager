"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { format } from "date-fns";

import { createClient } from "@/lib/supabase/client";
import type { Holiday } from "@/lib/holidays/types";

export function holidaysQueryKey(rangeStart: Date, rangeEnd: Date) {
  return [
    "holidays",
    format(rangeStart, "yyyy-MM-dd"),
    format(rangeEnd, "yyyy-MM-dd"),
  ] as const;
}

/**
 * Reads holidays directly from Supabase via the anon client. The `holidays`
 * table is RLS-public for SELECT so this is safe to call client-side.
 */
export function useHolidays(
  rangeStart: Date,
  rangeEnd: Date,
): UseQueryResult<Holiday[]> {
  return useQuery({
    queryKey: holidaysQueryKey(rangeStart, rangeEnd),
    staleTime: 24 * 60 * 60 * 1000, // 24h — holidays don't move
    queryFn: async (): Promise<Holiday[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("holidays")
        .select("id, country, date, name")
        .gte("date", format(rangeStart, "yyyy-MM-dd"))
        .lte("date", format(rangeEnd, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as Holiday[];
    },
  });
}
