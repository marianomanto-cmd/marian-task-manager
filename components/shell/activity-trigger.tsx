"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { markActivitySeenAction } from "@/app/actions/activity";
import { ActivityFeed } from "@/components/activity/activity-feed";
import {
  ACTIVITY_INVALIDATION_KEY,
  useActivity,
} from "@/components/activity/use-activity";
import { useIsDesktop } from "@/components/hooks/use-is-desktop";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function ActivityTrigger() {
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const { data } = useActivity(50);

  const markSeenMutation = useMutation({
    mutationFn: async () => {
      const result = await markActivitySeenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACTIVITY_INVALIDATION_KEY });
    },
  });

  const entries = data?.entries ?? [];
  const lastSeenMs = data?.lastSeenAt
    ? new Date(data.lastSeenAt).getTime()
    : 0;
  const unseenCount = entries.reduce((n, e) => {
    return new Date(e.created_at).getTime() > lastSeenMs ? n + 1 : n;
  }, 0);

  function handleOpenChange(open: boolean) {
    if (open && unseenCount > 0) {
      // Fire & forget — the feed already renders the unseen styling using
      // the old lastSeenAt, the next render after invalidation will clear it.
      markSeenMutation.mutate();
    }
  }

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unseenCount > 0
              ? `Actividad del equipo (${unseenCount} sin ver)`
              : "Actividad del equipo"
          }
          className="relative"
        >
          <Activity className="size-[1.1rem]" />
          {unseenCount > 0 ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-sky-500 text-[9px] font-bold text-white"
            >
              {unseenCount > 9 ? "9+" : unseenCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isDesktop ? "sm:max-w-md" : "max-h-[85vh]",
        )}
      >
        <SheetHeader className="border-b">
          <SheetTitle>Actividad del equipo</SheetTitle>
          <SheetDescription className="text-xs">
            Últimas 50 acciones sobre las tareas.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <ActivityFeed />
        </div>
      </SheetContent>
    </Sheet>
  );
}
