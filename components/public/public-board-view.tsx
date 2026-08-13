import { ThemeToggle } from "@/components/theme-toggle";
import {
  PublicBoardEmpty,
  PublicBoardHeader,
  PublicProjectCard,
  StatusSummary,
  countByStatus,
} from "@/components/public/public-board";
import type { PublicBoard } from "@/lib/projects/public-board";

/**
 * Full page body for a public board link. One client per link (/copa, /cmi),
 * or every client at once (/todos). Read-only by design: the client sees the
 * work, the team edits it in the app.
 */
export function PublicBoardView({ board }: { board: PublicBoard }) {
  const allItems = board.groups.flatMap((group) =>
    group.projects.flatMap((project) => project.items),
  );
  const totals = countByStatus(allItems);

  return (
    <>
      <PublicBoardHeader
        initials={initialsFor(board)}
        title={board.title}
        subtitle={
          board.allClients
            ? "Todos los clientes · sólo lectura"
            : "Board de pendientes · sólo lectura"
        }
        action={<ThemeToggle />}
      />

      <main className="mx-auto w-full max-w-7xl px-3 py-4 md:px-6 md:py-6">
        <section className="mb-4 flex flex-wrap items-center gap-3">
          <StatusSummary totals={totals} />
        </section>

        {allItems.length === 0 ? (
          <PublicBoardEmpty />
        ) : (
          <div className="flex flex-col gap-6">
            {board.groups.map((group) => {
              // Empty projects are worth showing inside a client's own board
              // (it tells them the project exists), but on /todos they are
              // just noise, so drop them there.
              const projects = board.allClients
                ? group.projects.filter((p) => p.items.length > 0)
                : group.projects;
              if (projects.length === 0) return null;

              const clientLabel = group.client ?? "Sin cliente";
              const count = projects.reduce((acc, p) => acc + p.items.length, 0);

              return (
                <section
                  key={clientLabel}
                  className="flex flex-col gap-3"
                  aria-label={clientLabel}
                >
                  {/* On a single-client link the header already names the
                      client, so this band would only repeat it. */}
                  {board.allClients ? (
                    <div className="flex items-baseline gap-2 border-b pb-1.5">
                      <h2 className="text-base font-semibold tracking-tight">
                        {clientLabel}
                      </h2>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {projects.length === 1
                          ? "1 proyecto"
                          : `${projects.length} proyectos`}{" "}
                        · {count === 1 ? "1 tarea" : `${count} tareas`}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-4">
                    {projects.map((project) => (
                      <PublicProjectCard
                        key={project.project}
                        project={project.project}
                        color={project.meta.color}
                        emoji={project.meta.emoji}
                        items={project.items}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="text-muted-foreground/70 mt-8 text-[11px]">
          Vista de sólo lectura. Las tareas archivadas no se muestran. Si
          necesitás un cambio, escribinos.
        </p>
      </main>
    </>
  );
}

function initialsFor(board: PublicBoard): string {
  if (board.allClients) return "AB";
  const trimmed = board.title.trim();
  if (trimmed.length === 0) return "·";
  return trimmed.slice(0, 2).toUpperCase();
}
