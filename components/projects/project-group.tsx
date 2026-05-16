"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import {
  deleteProjectAction,
  renameProjectAction,
} from "@/app/actions/projects";
import { ProjectItemRow } from "@/components/projects/project-item-row";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import {
  PROJECT_ITEM_STATUS_DOT,
  PROJECT_ITEM_STATUS_LABEL,
  type ProjectItem,
  type ProjectItemStatus,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

const STATUS_ORDER: ProjectItemStatus[] = ["pending", "ongoing", "waiting", "done"];

export function ProjectGroup({
  project,
  items,
  defaultOpen = true,
  canEdit,
}: {
  project: string;
  items: ProjectItem[];
  defaultOpen?: boolean;
  canEdit: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

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
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <header className="bg-muted/40 flex items-center gap-3 border-b px-3 py-2.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((v) => !v)}
          className="size-7"
          aria-label={open ? "Colapsar" : "Expandir"}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </Button>
        <h2 className="truncate text-sm font-semibold tracking-tight">
          {project}
        </h2>
        <div className="hidden items-center gap-1.5 md:flex">
          {STATUS_ORDER.map((s) =>
            stats[s] > 0 ? (
              <span
                key={s}
                className="text-muted-foreground inline-flex items-center gap-1 text-[11px]"
                title={PROJECT_ITEM_STATUS_LABEL[s]}
              >
                <span
                  className={cn("size-1.5 rounded-full", PROJECT_ITEM_STATUS_DOT[s])}
                />
                {stats[s]}
              </span>
            ) : null,
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-muted-foreground hidden text-[11px] sm:block">
            {doneCount}/{total} · {progress}%
          </div>
          <div className="bg-muted relative hidden h-1.5 w-24 overflow-hidden rounded-full md:block">
            <div
              className="bg-emerald-500/70 absolute inset-y-0 left-0"
              style={{ width: `${progress}%` }}
            />
          </div>
          {canEdit ? <GroupMenu project={project} /> : null}
        </div>
      </header>

      {open ? (
        <>
          {items.length === 0 ? (
            <div className="text-muted-foreground px-3 py-4 text-xs">
              Sin tareas todavía.
            </div>
          ) : (
            <div>
              {items.map((item) => (
                <ProjectItemRow key={item.id} item={item} />
              ))}
            </div>
          )}
          {canEdit ? <QuickAddRow project={project} /> : null}
        </>
      ) : null}
    </section>
  );
}

function GroupMenu({ project }: { project: string }) {
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
