import {
  Calendar,
  CalendarDays,
  FolderKanban,
  Inbox,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: "/inbox" | "/tasks" | "/calendar" | "/agenda" | "/projects";
  label: string;
  icon: LucideIcon;
  /** Visible only to ADMIN_EMAIL (Mariano). Bandeja + Calendario are personal. */
  adminOnly?: boolean;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/inbox", label: "Bandeja", icon: Inbox, adminOnly: true },
  { href: "/tasks", label: "Tareas", icon: ListChecks },
  { href: "/calendar", label: "Calendario", icon: Calendar, adminOnly: true },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
] as const;

export function visibleNavItems(isAdmin: boolean): readonly NavItem[] {
  return isAdmin ? NAV_ITEMS : NAV_ITEMS.filter((item) => !item.adminOnly);
}
