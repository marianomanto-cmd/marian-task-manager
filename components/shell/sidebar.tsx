"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { visibleNavItems } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar({
  isAdmin,
  collapsed = false,
}: {
  isAdmin: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const items = visibleNavItems(isAdmin);

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground hidden shrink-0 border-r transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex md:flex-col",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <nav className="flex flex-col gap-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
              className={cn(
                "flex items-center gap-3 rounded-md py-2 text-sm transition-colors focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-2",
                collapsed ? "justify-center px-0" : "px-3",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className={cn(collapsed && "sr-only")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
