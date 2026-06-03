import {
  CalendarRange,
  FolderKanban,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: "/tasks" | "/projects" | "/timeliner";
  label: string;
  icon: LucideIcon;
  /** Visible only to ADMIN_EMAIL (Mariano). */
  adminOnly?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/tasks", label: "Mi board", icon: ListChecks },
  // Proyectos is read-only for the team and editable only by the admin, but
  // everyone on the team can see it.
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
  { href: "/timeliner", label: "Timeliner", icon: CalendarRange },
] as const;

export function visibleNavItems(isAdmin: boolean): readonly NavItem[] {
  return isAdmin ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.adminOnly);
}
