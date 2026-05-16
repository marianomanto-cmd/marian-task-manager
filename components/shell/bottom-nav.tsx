"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { visibleNavItems } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = visibleNavItems(isAdmin);
  // With a single nav item there's nothing to switch to — skip the bar.
  if (items.length <= 1) return null;
  const gridCols = items.length === 2 ? "grid-cols-2" : "grid-cols-1";

  return (
    <nav
      className={cn(
        "bg-background/95 supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-30 grid border-t backdrop-blur md:hidden",
        gridCols,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 px-2 text-[11px] transition-colors",
              active
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
