"use client";

import * as React from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { FilterMenu } from "@/components/shell/filter-menu";
import {
  PublicBoardEmpty,
  PublicBoardHeader,
  PublicProjectCard,
  StatusSummary,
  countByStatus,
} from "@/components/public/public-board";
import type { PublicBoard, PublicBoardItem } from "@/lib/projects/public-board";
import {
  PROJECT_ITEM_CATEGORIES,
  PROJECT_ITEM_CATEGORY_LABEL,
  PROJECT_ITEM_STATUSES,
  PROJECT_ITEM_STATUS_LABEL,
  type ProjectItemCategory,
  type ProjectItemStatus,
} from "@/lib/projects/types";

/**
 * Full page body for a public board link. One client per link (/copa, /cmi),
 * or every client at once (/todos). Read-only by design: the client sees the
 * work, the team edits it in the app.
 *
 * Filtering runs in the browser over the rows the server already sent. That is
 * safe because those rows are only ever this client's own tasks — the scoping
 * happens in SQL before the page is built, never here.
 */

const STATUS_OPTIONS = PROJECT_ITEM_STATUSES.map((s) => ({
  value: s,
  label: PROJECT_ITEM_STATUS_LABEL[s],
}));

const CATEGORY_OPTIONS = PROJECT_ITEM_CATEGORIES.map((c) => ({
  value: c,
  label: PROJECT_ITEM_CATEGORY_LABEL[c],
}));

/**
 * Done work is history, not a pending item, so a client opening their board
 * shouldn't have to scroll past it. It stays one click away in the Status menu.
 */
const DEFAULT_STATUSES: ProjectItemStatus[] = PROJECT_ITEM_STATUSES.filter(
  (s) => s !== "done",
);

export function PublicBoardView({ board }: { board: PublicBoard }) {
  const [statuses, setStatuses] =
    React.useState<ProjectItemStatus[]>(DEFAULT_STATUSES);
  const [categories, setCategories] = React.useState<ProjectItemCategory[]>([
    ...PROJECT_ITEM_CATEGORIES,
  ]);

  // An empty selection reads as "no filter on this field" rather than "hide
  // everything" — same convention the team board uses, and it keeps the board
  // from going blank when someone unchecks the last option.
  const matches = React.useCallback(
    (item: PublicBoardItem) =>
      (statuses.length === 0 || statuses.includes(item.status)) &&
      (categories.length === 0 || categories.includes(item.category)),
    [statuses, categories],
  );

  const groups = React.useMemo(
    () =>
      board.groups
        .map((group) => ({
          ...group,
          projects: group.projects
            .map((project) => ({
              ...project,
              items: project.items.filter(matches),
            }))
            // A project with nothing left to show would just read as an empty
            // card, so drop it while a filter is narrowing the board.
            .filter((project) => project.items.length > 0),
        }))
        .filter((group) => group.projects.length > 0),
    [board.groups, matches],
  );

  const shownItems = groups.flatMap((group) =>
    group.projects.flatMap((project) => project.items),
  );
  const totals = countByStatus(shownItems);

  const totalItems = board.groups.reduce(
    (acc, group) =>
      acc + group.projects.reduce((sum, project) => sum + project.items.length, 0),
    0,
  );
  const hiddenCount = totalItems - shownItems.length;
  const doneHidden = !statuses.includes("done");

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
        <section className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusSummary totals={totals} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <FilterMenu<ProjectItemStatus>
              label="Status"
              options={STATUS_OPTIONS}
              selected={statuses}
              onChange={setStatuses}
              align="end"
            />
            <FilterMenu<ProjectItemCategory>
              label="Área"
              options={CATEGORY_OPTIONS}
              selected={categories}
              onChange={setCategories}
              align="end"
            />
          </div>
        </section>

        {hiddenCount > 0 ? (
          <p className="text-muted-foreground mb-3 text-[11px]">
            {hiddenCount === 1
              ? "1 tarea oculta por los filtros"
              : `${hiddenCount} tareas ocultas por los filtros`}
            {doneHidden ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => setStatuses([...PROJECT_ITEM_STATUSES])}
                >
                  Mostrar las done
                </button>
              </>
            ) : null}
            {" · "}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setStatuses([...PROJECT_ITEM_STATUSES]);
                setCategories([...PROJECT_ITEM_CATEGORIES]);
              }}
            >
              Ver todo
            </button>
          </p>
        ) : null}

        {totalItems === 0 ? (
          <PublicBoardEmpty />
        ) : shownItems.length === 0 ? (
          <div className="bg-muted/30 rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm font-medium">
              Ninguna tarea coincide con los filtros
            </p>
            <button
              type="button"
              className="text-primary text-xs underline-offset-2 hover:underline"
              onClick={() => {
                setStatuses([...PROJECT_ITEM_STATUSES]);
                setCategories([...PROJECT_ITEM_CATEGORIES]);
              }}
            >
              Ver todas las tareas
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => {
              const clientLabel = group.client ?? "Sin cliente";
              const count = group.projects.reduce(
                (acc, p) => acc + p.items.length,
                0,
              );

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
                        {group.projects.length === 1
                          ? "1 proyecto"
                          : `${group.projects.length} proyectos`}{" "}
                        · {count === 1 ? "1 tarea" : `${count} tareas`}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-4">
                    {group.projects.map((project) => (
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
