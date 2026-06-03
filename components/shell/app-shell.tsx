"use client";

import * as React from "react";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";

const STORAGE_KEY = "agencyboard:sidebar-collapsed";

const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* localStorage may be unavailable (private mode) — ignore. */
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Collapsible-sidebar preference, persisted in localStorage and synced across
 * tabs. Backed by useSyncExternalStore so the server always renders expanded
 * (no hydration mismatch) and the client reconciles to the stored value.
 */
function useSidebarCollapsed(): readonly [boolean, () => void] {
  const collapsed = React.useSyncExternalStore(
    subscribe,
    readCollapsed,
    () => false,
  );
  const toggle = React.useCallback(() => writeCollapsed(!readCollapsed()), []);
  return [collapsed, toggle];
}

type AppShellUser = {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
};

/**
 * Client shell that owns the collapsible-sidebar state so the header toggle
 * and the sidebar stay in sync.
 */
export function AppShell({
  isAdmin,
  user,
  children,
}: {
  isAdmin: boolean;
  user: AppShellUser;
  children: React.ReactNode;
}) {
  const [collapsed, toggleSidebar] = useSidebarCollapsed();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <Header
        isAdmin={isAdmin}
        user={user}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
      />
      <div className="flex flex-1">
        <Sidebar isAdmin={isAdmin} collapsed={collapsed} />
        <main className="min-w-0 flex-1 pb-16 md:pb-0">{children}</main>
      </div>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
