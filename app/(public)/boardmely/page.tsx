import { MelyBoard } from "@/components/mely/mely-board";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Board - Mely",
  robots: { index: false, follow: false },
};

export default function BoardMelyPage() {
  return (
    <>
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[96rem] items-center gap-3 px-4 md:px-6">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-md text-xs font-bold">
            M
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">Board - Mely</div>
            <div className="text-muted-foreground text-[11px]">
              Tu board de pendientes
            </div>
          </div>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <MelyBoard />
      </main>
    </>
  );
}
