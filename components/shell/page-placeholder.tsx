import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  title,
  description,
  icon: Icon,
  phase,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: string;
}) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6 md:py-10">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground text-sm">{description}</p>
      </header>
      <div className="bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <Icon className="text-muted-foreground size-8" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Pendiente</p>
          <p className="text-muted-foreground text-xs">
            Esta vista se completa en {phase}.
          </p>
        </div>
      </div>
    </section>
  );
}
