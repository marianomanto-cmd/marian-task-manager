"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";

import { createProjectItemAction } from "@/app/actions/projects";
import { FilterChips } from "@/components/tasks/filter-chips";
import { ProjectGroup } from "@/components/projects/project-group";
import {
  PROJECT_ITEMS_KEY,
  useProjectItems,
} from "@/components/projects/use-project-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import {
  PROJECT_ITEM_CATEGORIES,
  PROJECT_ITEM_CATEGORY_LABEL,
  PROJECT_ITEM_STATUSES,
  PROJECT_ITEM_STATUS_LABEL,
  type ProjectItem,
  type ProjectItemCategory,
  type ProjectItemStatus,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = PROJECT_ITEM_STATUSES.map((s) => ({
  value: s,
  label: PROJECT_ITEM_STATUS_LABEL[s],
}));
const CATEGORY_OPTIONS = PROJECT_ITEM_CATEGORIES.map((c) => ({
  value: c,
  label: PROJECT_ITEM_CATEGORY_LABEL[c],
}));

export function ProjectsBoard({ canEdit }: { canEdit: boolean }) {
  const query = useProjectItems();
  const [statuses, setStatuses] = React.useState<ProjectItemStatus[]>([
    ...PROJECT_ITEM_STATUSES,
  ]);
  const [categories, setCategories] = React.useState<ProjectItemCategory[]>([
    ...PROJECT_ITEM_CATEGORIES,
  ]);
  const [search, setSearch] = React.useState("");

  const items = React.useMemo(
    () => query.data?.items ?? [],
    [query.data?.items],
  );

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (!statuses.includes(it.status)) return false;
      if (!categories.includes(it.category)) return false;
      if (term.length > 0) {
        const haystack = `${it.project} ${it.title}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [items, statuses, categories, search]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, ProjectItem[]>();
    for (const it of filtered) {
      if (!map.has(it.project)) map.set(it.project, []);
      map.get(it.project)!.push(it);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      a.localeCompare(b, "es"),
    );
  }, [filtered]);

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            Proyectos
          </h1>
          <p className="text-muted-foreground text-xs">
            Tareas por cliente, agrupadas por proyecto. Visible para todo el
            equipo; sólo Mariano edita.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="h-9 w-44 pl-7 md:w-56"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label="Actualizar"
          >
            <RefreshCw className={cn(query.isFetching && "animate-spin")} />
          </Button>
          {canEdit ? <NewProjectButton existingProjects={items.map((i) => i.project)} /> : null}
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <FilterChips<ProjectItemStatus>
          label="Status"
          options={STATUS_OPTIONS}
          selected={statuses}
          onChange={setStatuses}
        />
        <FilterChips<ProjectItemCategory>
          label="Categoría"
          options={CATEGORY_OPTIONS}
          selected={categories}
          onChange={setCategories}
        />
      </div>

      {query.data?.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          Iniciá sesión para ver el board.
        </p>
      ) : null}
      {query.data?.error && !query.data.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          {query.data.error}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando board…</p>
      ) : grouped.length === 0 ? (
        <EmptyState canEdit={canEdit} hasItems={items.length > 0} />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([project, list]) => (
            <ProjectGroup
              key={project}
              project={project}
              items={list}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({
  canEdit,
  hasItems,
}: {
  canEdit: boolean;
  hasItems: boolean;
}) {
  return (
    <div className="bg-muted/30 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium">
        {hasItems ? "Sin resultados con estos filtros" : "Sin tareas todavía"}
      </p>
      <p className="text-muted-foreground text-xs">
        {hasItems
          ? "Probá quitar filtros o limpiar la búsqueda."
          : canEdit
            ? "Tocá Nuevo proyecto para arrancar."
            : "Cuando Mariano cargue tareas las vas a ver acá."}
      </p>
    </div>
  );
}

function NewProjectButton({
  existingProjects,
}: {
  existingProjects: string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [project, setProject] = React.useState("");
  const [title, setTitle] = React.useState("");

  const uniqueProjects = React.useMemo(
    () => Array.from(new Set(existingProjects)).sort((a, b) => a.localeCompare(b, "es")),
    [existingProjects],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createProjectItemAction({
        project: project.trim(),
        title: title.trim(),
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setProject("");
      setTitle("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function submit() {
    if (!project.trim() || !title.trim()) return;
    createMutation.mutate();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button">
          <Plus />
          Nueva tarea
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="text-sm font-medium">Nueva tarea</div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Proyecto
          </label>
          <Input
            list="existing-projects"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Cliente / campaña…"
          />
          <datalist id="existing-projects">
            {uniqueProjects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Tarea
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Descripción corta"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={submit}
            disabled={
              !project.trim() || !title.trim() || createMutation.isPending
            }
          >
            Agregar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
