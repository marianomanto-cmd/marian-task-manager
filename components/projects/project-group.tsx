"use client";

import * as React from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MoreHorizontal, Palette, Trash2 } from "lucide-react";

import {
  deleteProjectAction,
  renameProjectAction,
} from "@/app/actions/projects";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { ProjectItemRow } from "@/components/projects/project-item-row";
import { ProjectMetaEditor } from "@/components/projects/project-meta-editor";
import { QuickAddRow } from "@/components/projects/quick-add-row";
import { PROJECT_ITEMS_KEY } from "@/components/projects/use-project-items";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  PROJECT_COLOR_CLASS,
  PROJECT_ITEM_STATUS_DOT,
  PROJECT_ITEM_STATUS_LABEL,
  defaultProjectMeta,
  pickStableColor,
  type DensityMode,
  type ProjectColor,
  type ProjectItem,
  type ProjectItemStatus,
  type ProjectMeta,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

const STATUS_ORDER: ProjectItemStatus[] = [
  "pending",
  "ongoing",
  "waiting",
  "done",
];

function ProjectName({
  project,
  canEdit,
}: {
  project: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(project);

  const renameMutation = useMutation({
    mutationFn: async (to: string) => {
      const result = await renameProjectAction({ from: project, to });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
    },
    onError: (err: Error) => {
      showToast({ title: err.message });
      setDraft(project);
      setEditing(false);
    },
  });

  function beginEdit() {
    if (!canEdit) return;
    setDraft(project);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== project) renameMutation.mutate(trimmed);
    else {
      setDraft(project);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(project);
            setEditing(false);
          }
        }}
        disabled={renameMutation.isPending}
        className="h-7 w-48 max-w-full text-sm font-semibold md:text-base"
      />
    );
  }

  if (!canEdit) {
    return (
      <h2 className="truncate text-sm font-semibold tracking-tight md:text-base">
        {project}
      </h2>
    );
  }

  return (
    <h2 className="min-w-0 truncate">
      <button
        type="button"
        onClick={beginEdit}
        className="-mx-1 max-w-full cursor-text truncate rounded px-1 text-left text-sm font-semibold tracking-tight hover:bg-foreground/5 md:text-base"
        title="Click para renombrar"
      >
        {project}
      </button>
    </h2>
  );
}

function GroupMenu({
  project,
  color,
  emoji,
  client,
  clientNames,
}: {
  project: string;
  color: ProjectColor;
  emoji: string | null;
  client: string | null;
  clientNames: string[];
}) {
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteProjectAction(project);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
      showToast({
        title: `${data.project} eliminado (${data.count} tareas).`,
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  return (
    <>
      <ProjectMetaEditor
        project={project}
        color={color}
        emoji={emoji}
        client={client}
        clients={clientNames}
        trigger={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Personalizar proyecto"
          >
            <Palette className="size-3.5" />
          </Button>
        }
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={`Acciones de ${project}`}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              if (
                confirm(
                  `¿Eliminar "${project}" y todas sus tareas? No se puede deshacer.`,
                )
              )
                deleteMutation.mutate();
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Eliminar proyecto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

type ClientProject = {
  project: string;
  meta: ProjectMeta | undefined;
  items: ProjectItem[];
};

export function ClientGroup({
  client,
  projects,
  canEdit,
  density,
  clientNames = [],
  defaultOpen = true,
}: {
  client: string;
  projects: ClientProject[];
  canEdit: boolean;
  density: DensityMode;
  clientNames?: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const color = pickStableColor(client);
  const palette = PROJECT_COLOR_CLASS[color];

  const allItems = React.useMemo(
    () => projects.flatMap((p) => p.items),
    [projects],
  );

  const stats = React.useMemo(() => {
    const counts: Record<ProjectItemStatus, number> = {
      pending: 0,
      ongoing: 0,
      waiting: 0,
      done: 0,
    };
    for (const it of allItems) counts[it.status]++;
    return counts;
  }, [allItems]);

  const total = allItems.length;
  const doneCount = stats.done;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <header
        className={cn(
          "flex items-center gap-2 border-b px-2 py-2.5 md:px-3",
          palette.soft,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((v) => !v)}
          className="size-7 shrink-0"
          aria-label={open ? "Colapsar" : "Expandir"}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </Button>

        <ProjectAvatar project={client} color={color} emoji={null} size="md" />

        <h2 className="truncate text-sm font-semibold tracking-tight md:text-base">
          {client}
        </h2>

        <span className="text-muted-foreground hidden text-[11px] tabular-nums sm:inline">
          {projects.length} {projects.length === 1 ? "proyecto" : "proyectos"}
        </span>

        <div className="hidden items-center gap-1.5 pl-2 lg:flex">
          {STATUS_ORDER.map((s) =>
            stats[s] > 0 ? (
              <span
                key={s}
                className="text-muted-foreground inline-flex items-center gap-1 text-[11px]"
                title={PROJECT_ITEM_STATUS_LABEL[s]}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    PROJECT_ITEM_STATUS_DOT[s],
                  )}
                />
                {stats[s]}
              </span>
            ) : null,
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="text-muted-foreground hidden text-[11px] tabular-nums sm:block">
            {doneCount}/{total}
          </div>
          <div className="bg-muted relative hidden h-1.5 w-20 overflow-hidden rounded-full md:block">
            <div
              className={cn("absolute inset-y-0 left-0", palette.bar)}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {open ? (
        <div>
          {projects.map(({ project, meta, items }) => {
            const pm = meta ?? defaultProjectMeta(project);
            return (
              <div key={project}>
                <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-2">
                  <ProjectAvatar
                    project={project}
                    color={pm.color}
                    emoji={pm.emoji}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <ProjectName project={project} canEdit={canEdit} />
                  </div>
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {items.length}
                  </span>
                  {canEdit ? (
                    <GroupMenu
                      project={project}
                      color={pm.color}
                      emoji={pm.emoji}
                      client={pm.client ?? null}
                      clientNames={clientNames}
                    />
                  ) : null}
                </div>
                <SortableContext
                  items={items.map((it) => it.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((item) => (
                    <ProjectItemRow
                      key={item.id}
                      item={item}
                      density={density}
                      canEdit={canEdit}
                      draggable={canEdit}
                    />
                  ))}
                </SortableContext>
                {canEdit ? <QuickAddRow project={project} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
