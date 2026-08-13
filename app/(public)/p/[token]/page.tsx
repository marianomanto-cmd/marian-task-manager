import { notFound } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import {
  PublicBoardEmpty,
  PublicBoardHeader,
  PublicProjectCard,
  StatusSummary,
  countByStatus,
} from "@/components/public/public-board";
import { loadSharedBoard, type SharedProjectItem } from "@/lib/projects/share";
import { defaultProjectMeta, type ProjectMeta } from "@/lib/projects/types";

/**
 * Legacy token link (`/p/<uuid>`): one read-only link covering the whole
 * board. Per-client links (`/copa`, `/cmi`, …) are the newer way to share and
 * scope to a single client; this route stays for tokens already handed out.
 */

export const metadata = {
  title: "Board · Agency Board",
  robots: { index: false, follow: false },
};

export default async function SharedBoardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadSharedBoard(token);
  if (!data) notFound();

  const metaByProject = new Map<string, ProjectMeta>();
  for (const m of data.meta) metaByProject.set(m.project, m);

  const grouped = new Map<string, SharedProjectItem[]>();
  for (const item of data.items) {
    const bucket = grouped.get(item.project);
    if (bucket) bucket.push(item);
    else grouped.set(item.project, [item]);
  }

  const groups = Array.from(grouped.entries()).sort(([a], [b]) => {
    const pa = metaByProject.get(a)?.position ?? 1e6;
    const pb = metaByProject.get(b)?.position ?? 1e6;
    return pa - pb || a.localeCompare(b, "es");
  });

  const totals = countByStatus(data.items);

  return (
    <>
      <PublicBoardHeader
        initials="AB"
        title="Board de pendientes"
        subtitle="Vista compartida · sólo lectura"
        action={<ThemeToggle />}
      />

      <main className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6 md:py-6">
        <section className="mb-4 flex flex-wrap items-center gap-3">
          <StatusSummary totals={totals} />
        </section>

        {groups.length === 0 ? (
          <PublicBoardEmpty />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(([project, items]) => {
              const meta =
                metaByProject.get(project) ?? defaultProjectMeta(project);
              return (
                <PublicProjectCard
                  key={project}
                  project={project}
                  color={meta.color}
                  emoji={meta.emoji}
                  items={items}
                />
              );
            })}
          </div>
        )}

        <p className="text-muted-foreground/70 mt-6 text-[11px]">
          Este link es de sólo lectura. Si querés sumarte al espacio del equipo
          pedile acceso a Mariano.
        </p>
      </main>
    </>
  );
}
