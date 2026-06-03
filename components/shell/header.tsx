import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { TimezoneClocks } from "@/components/shell/timezone-clocks";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type HeaderProps = {
  isAdmin: boolean;
  user: {
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
};

export function Header({
  isAdmin,
  user,
  sidebarCollapsed = false,
  onToggleSidebar,
}: HeaderProps) {
  const homeHref = isAdmin ? "/projects" : "/tasks";

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 md:gap-4 md:px-6">
        {onToggleSidebar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-pressed={sidebarCollapsed}
            aria-label={
              sidebarCollapsed
                ? "Expandir barra lateral"
                : "Colapsar barra lateral"
            }
            title={
              sidebarCollapsed
                ? "Expandir barra lateral"
                : "Colapsar barra lateral"
            }
            className="hidden md:inline-flex"
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        ) : null}

        <Link href={homeHref} className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-md text-xs font-bold">
            AB
          </span>
          <span className="hidden text-sm sm:inline">Agency Board</span>
        </Link>

        <div className="ml-auto flex items-center gap-2 md:gap-4">
          <TimezoneClocks variant="header" />
          <ThemeToggle />
          <UserMenu
            email={user.email}
            name={user.name}
            avatarUrl={user.avatarUrl}
          />
        </div>
      </div>
      <div className="border-t md:hidden">
        <TimezoneClocks variant="compact" className="px-4 py-1.5" />
      </div>
    </header>
  );
}
