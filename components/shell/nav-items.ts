import { FolderKanban, ListChecks, type LucideIcon } from "lucide-react";

export type NavItem = {
  href: "/tasks" | "/projects";
  label: string;
  icon: LucideIcon;
  /** Visible only to ADMIN_EMAIL (Mariano). */
  adminOnly?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/tasks", label: "Mi board", icon: ListChecks },
  { href: "/projects", label: "Proyectos", icon: FolderKanban, adminOnly: true },
] as const;

export function visibleNavItems(isAdmin: boolean): readonly NavItem[] {
  return isAdmin ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.adminOnly);
}
