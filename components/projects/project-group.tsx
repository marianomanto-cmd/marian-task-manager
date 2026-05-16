"use client";

/* eslint-disable react-hooks/refs -- @dnd-kit's useSortable returns ref-like
   values that the React 19 refs rule flags as "during render"; this is the
   library's documented usage and runs correctly. */

import * as React from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";

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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import {
  PROJECT_COLOR_CLASS,
  PROJECT_ITEM_STATUS_DOT,
  PROJECT_ITEM_STATUS_LABEL,
  defaultProjectMeta,
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

type Props = {
  project: string;
  items: ProjectItem[];
  meta: ProjectMeta | undefined;
  canEdit: boolean;
  density: DensityMode;
  defaultOpen?: boolean;
};

export function ProjectGroup({
  project,
  items,
  meta,
  canEdit,
  density,
  defaultOpen = true,
}: Props) {
  const m = meta ?? defaultProjectMeta(project);
  const sortable = useSortable({
    id: `project:${project}`,
    disabled: !canEdit,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  const [open, setOpen] = React.useState(defaultOpen);
  const palette = PROJECT_COLOR_CLASS[m.color];

  const stats = React.useMemo(() => {
    const counts: Record<ProjectItemStatus, number> = {
      pending: 0,
      ongoing: 0,
      waiting: 0,
      done: 0,
    };
    for (const it of items) counts[it.status]++;
    return counts;
  }, [items]);

  const total = items.length;
  const doneCount = stats.done;
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <section
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "bg-card overflow-hidden rounded-xl border shadow-sm",
        sortable.isOver && "ring-primary/40 ring-2",
      )}
    >
      <header
        className={cn(
          "flex items-center gap-2 border-b px-2 py-2.5 md:px-3",
          palette.soft,
        )}
      >
        {canEdit ? (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            className="text-muted-foreground/40 hover:text-foreground hidden size-7 cursor-grab items-center justify-center active:cursor-grabbing md:inline-flex"
            aria-label="Reordenar proyecto"
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : null}

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

        <ProjectAvatar
          project={project}
          color={m.color}
          emoji={m.emoji}
          size="md"
        />

        <h2 className="truncate text-sm font-semibold tracking-tight md:text-base">
          {project}
        </h2>

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
          {canEdit ? (
            <GroupMenu
              project={project}
              color={m.color as ProjectColor}
              emoji={m.emoji}
            />
          ) : null}
        </div>
      </header>

      {open ? (
        <>
          {items.length === 0 ? (
            <div className="text-muted-foreground px-3 py-4 text-xs">
              Sin tareas todavía.
            </div>
          ) : (
            <SortableContext
              items={items.map((it) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {items.map((item) => (
                  <ProjectItemRow
                    key={item.id}
                    item={item}
                    density={density}
                    canEdit={canEdit}
                    draggable={item.archived_at === null}
                  />
                ))}
              </div>
            </SortableContext>
          )}
          {canEdit ? <QuickAddRow project={project} /> : null}
        </>
      ) : null}
    </section>
  );
}

function GroupMenu({
  project,
  color,
  emoji,
}: {
  project: string;
  color: ProjectColor;
  emoji: string | null;
}) {
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(project);

  function openRename() {
    setDraft(project);
    setRenameOpen(true);
  }

  const renameMutation = useMutation({
    mutationFn: async (to: string) => {
      const result = await renameProjectAction({ from: project, to });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setRenameOpen(false);
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

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
          <DropdownMenuItem onClick={openRename}>
            <Pencil className="size-3.5" />
            Renombrar proyecto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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

      <Popover open={renameOpen} onOpenChange={setRenameOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-2">
          <div className="text-xs font-medium">Renombrar proyecto</div>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim() && draft !== project) {
                e.preventDefault();
                renameMutation.mutate(draft.trim());
              }
            }}
            autoFocus
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => renameMutation.mutate(draft.trim())}
              disabled={!draft.trim() || draft === project}
            >
              Guardar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
