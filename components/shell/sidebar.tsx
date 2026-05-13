"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { visibleNavItems } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = visibleNavItems(isAdmin);

  return (
    <aside className="bg-sidebar text-sidebar-foreground hidden w-56 shrink-0 border-r md:flex md:flex-col">
      <nav className="flex flex-col gap-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
