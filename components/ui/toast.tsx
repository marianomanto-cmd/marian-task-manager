"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: string;
  title: string;
  description?: string;
  action?: ToastAction;
  duration: number;
};

type ToastInput = Omit<Toast, "id" | "duration"> & { duration?: number };

let counter = 0;
const listeners = new Set<() => void>();
let toasts: Toast[] = [];

function notify() {
  for (const listener of listeners) listener();
}

export function showToast(input: ToastInput): string {
  const id = `toast-${++counter}`;
  const item: Toast = { id, duration: input.duration ?? 6000, ...input };
  toasts = [...toasts, item];
  notify();
  if (typeof window !== "undefined" && item.duration > 0) {
    window.setTimeout(() => dismissToast(id), item.duration);
  }
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Toast[] {
  return toasts;
}

function getServerSnapshot(): Toast[] {
  return [];
}

export function ToastViewport({ className }: { className?: string }) {
  const items = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <div
      role="region"
      aria-label="Notificaciones"
      className={cn(
        "pointer-events-none fixed right-3 bottom-20 z-[60] flex w-[calc(100%-1.5rem)] max-w-sm flex-col gap-2 md:right-4 md:bottom-4",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto bg-card text-card-foreground data-[state=open]:animate-in fade-in slide-in-from-bottom-2 flex items-start gap-3 rounded-md border p-3 shadow-lg"
          role="status"
        >
          <div className="flex-1 space-y-0.5">
            <p className="text-sm font-medium leading-tight">{item.title}</p>
            {item.description ? (
              <p className="text-muted-foreground text-xs leading-snug">
                {item.description}
              </p>
            ) : null}
          </div>
          {item.action ? (
            <button
              type="button"
              onClick={() => {
                item.action!.onClick();
                dismissToast(item.id);
              }}
              className="text-primary text-sm font-medium hover:underline"
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => dismissToast(item.id)}
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 shrink-0 rounded p-1"
            aria-label="Cerrar"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
