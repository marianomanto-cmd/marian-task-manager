"use client";

import * as React from "react";
import { Activity } from "lucide-react";

import { ActivityFeed } from "@/components/activity/activity-feed";
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

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actividad del equipo">
          <Activity className="size-[1.1rem]" />
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
