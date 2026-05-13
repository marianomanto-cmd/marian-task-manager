import {
  Calendar,
  FolderKanban,
  Inbox,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: "/inbox" | "/tasks" | "/calendar" | "/projects";
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/inbox", label: "Bandeja", icon: Inbox },
  { href: "/tasks", label: "Tareas", icon: ListChecks },
  { href: "/calendar", label: "Calendario", icon: Calendar },
  { href: "/projects", label: "Proyectos", icon: FolderKanban },
] as const;
