"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Download,
  Plus,
  RefreshCw,
  Rows3,
  Search,
} from "lucide-react";

import {
  createProjectItemAction,
  reorderProjectItemsAction,
  reorderProjectsAction,
} from "@/app/actions/projects";
import { ProjectGroup } from "@/components/projects/project-group";
import { ShareButton } from "@/components/projects/share-button";
import {
  PROJECT_ITEMS_KEY,
  projectBoardKey,
  useProjectBoard,
} from "@/components/projects/use-project-items";
import { FilterChips } from "@/components/tasks/filter-chips";
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
  defaultProjectMeta,
  type DensityMode,
  type ProjectItem,
  type ProjectItemCategory,
  type ProjectItemStatus,
  type ProjectMeta,
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

type View = "active" | "archive";

export function ProjectsBoard({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = React.useState<View>("active");
  const query = useProjectBoard({ archiveMode: view });
  const qc = useQueryClient();

  const [statuses, setStatuses] = React.useState<ProjectItemStatus[]>([
    ...PROJECT_ITEM_STATUSES,
  ]);
  const [categories, setCategories] = React.useState<ProjectItemCategory[]>([
    ...PROJECT_ITEM_CATEGORIES,
  ]);
  const [search, setSearch] = React.useState("");
  const [density, setDensity] = React.useState<DensityMode>("comfortable");
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [newOpen, setNewOpen] = React.useState(false);

  const items = React.useMemo(
    () => query.data?.data.items ?? [],
    [query.data?.data.items],
  );
  const meta = React.useMemo(
    () => query.data?.data.meta ?? [],
    [query.data?.data.meta],
  );
  const metaByProject = React.useMemo(() => {
    const map = new Map<string, ProjectMeta>();
    for (const m of meta) map.set(m.project, m);
    return map;
  }, [meta]);

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((it) => {
      if (!statuses.includes(it.status)) return false;
      if (!categories.includes(it.category)) return false;
      if (term.length > 0) {
        const hay = `${it.project} ${it.title} ${it.description ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
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
    return Array.from(map.entries());
  }, [filtered]);

  const orderedGroups = React.useMemo(() => {
    return grouped.sort(([a], [b]) => {
      const ma = metaByProject.get(a);
      const mb = metaByProject.get(b);
      const pa = ma?.position ?? 1e6;
      const pb = mb?.position ?? 1e6;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b, "es");
    });
  }, [grouped, metaByProject]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorderItemsMutation = useMutation({
    mutationFn: async (vars: { project: string; ids: string[] }) => {
      const result = await reorderProjectItemsAction(vars);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: projectBoardKey({ archiveMode: view }),
      }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const reorderProjectsMutation = useMutation({
    mutationFn: async (projects: string[]) => {
      const result = await reorderProjectsAction({ projects });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith("project:") && overId.startsWith("project:")) {
      const names = orderedGroups.map(([p]) => p);
      const oldIdx = names.indexOf(activeId.slice("project:".length));
      const newIdx = names.indexOf(overId.slice("project:".length));
      if (oldIdx === -1 || newIdx === -1) return;
      const next = arrayMove(names, oldIdx, newIdx);
      reorderProjectsMutation.mutate(next);
      return;
    }

    const activeItem = items.find((it) => it.id === activeId);
    const overItem = items.find((it) => it.id === overId);
    if (!activeItem || !overItem) return;
    if (activeItem.project !== overItem.project) return;

    const list = items.filter((it) => it.project === activeItem.project);
    const oldIdx = list.findIndex((it) => it.id === activeId);
    const newIdx = list.findIndex((it) => it.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;
    const nextIds = arrayMove(list, oldIdx, newIdx).map((it) => it.id);
    reorderItemsMutation.mutate({
      project: activeItem.project,
      ids: nextIds,
    });
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (canEdit && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setNewOpen(true);
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setView((v) => (v === "active" ? "archive" : "active"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  function exportCsv() {
    const rows = [
      [
        "project",
        "title",
        "category",
        "status",
        "due_date",
        "link",
        "description",
      ],
      ...items.map((it) => [
        it.project,
        it.title,
        it.category,
        it.status,
        it.due_date ?? "",
        it.link ?? "",
        (it.description ?? "").replace(/\n/g, " "),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proyectos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const projectIds = orderedGroups.map(([p]) => `project:${p}`);
  const inArchive = view === "archive";

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {inArchive ? "Archivo de proyectos" : "Proyectos"}
          </h1>
          <p className="text-muted-foreground text-xs">
            {inArchive
              ? "Tareas archivadas. Reactivá las que vuelvan a estar en juego."
              : "Tareas por cliente, agrupadas por proyecto. Visible para todo el equipo; sólo Mariano edita."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar… (/)"
              className="h-9 w-40 pl-7 md:w-56"
            />
          </div>
          <Button
            type="button"
            variant={inArchive ? "default" : "outline"}
            size="sm"
            onClick={() => setView(inArchive ? "active" : "archive")}
            title="Archivo (A)"
          >
            <Archive />
            {inArchive ? "Volver" : "Archivo"}
          </Button>
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
          <DensityToggle value={density} onChange={setDensity} />
          {canEdit && !inArchive ? <ShareButton /> : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={exportCsv}
            disabled={items.length === 0}
            title="Exportar CSV"
          >
            <Download />
            CSV
          </Button>
          {canEdit && !inArchive ? (
            <NewItemButton
              open={newOpen}
              onOpenChange={setNewOpen}
              existingProjects={items.map((i) => i.project)}
            />
          ) : null}
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
      ) : orderedGroups.length === 0 ? (
        <EmptyState
          canEdit={canEdit}
          hasItems={items.length > 0}
          archive={inArchive}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={projectIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-4">
              {orderedGroups.map(([project, list]) => (
                <ProjectGroup
                  key={project}
                  project={project}
                  items={list}
                  meta={metaByProject.get(project) ?? defaultProjectMeta(project)}
                  canEdit={canEdit && !inArchive}
                  density={density}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <KeyboardHint canEdit={canEdit} />
    </section>
  );
}

function DensityToggle({
  value,
  onChange,
}: {
  value: DensityMode;
  onChange: (next: DensityMode) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={() => onChange(value === "compact" ? "comfortable" : "compact")}
      aria-label={value === "compact" ? "Cambiar a cómodo" : "Cambiar a compacto"}
      title={value === "compact" ? "Cómodo" : "Compacto"}
    >
      {value === "compact" ? <ArrowDown /> : <ArrowUp />}
      <Rows3 className="sr-only" />
    </Button>
  );
}

function EmptyState({
  canEdit,
  hasItems,
  archive,
}: {
  canEdit: boolean;
  hasItems: boolean;
  archive: boolean;
}) {
  return (
    <div className="bg-muted/30 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium">
        {hasItems
          ? "Sin resultados con estos filtros"
          : archive
            ? "Nada archivado todavía"
            : "Sin tareas todavía"}
      </p>
      <p className="text-muted-foreground text-xs">
        {hasItems
          ? "Probá quitar filtros o limpiar la búsqueda."
          : archive
            ? "Cuando archives tareas las vas a ver acá."
            : canEdit
              ? "Tocá Nueva tarea o presioná N para arrancar."
              : "Cuando Mariano cargue tareas las vas a ver acá."}
      </p>
    </div>
  );
}

function KeyboardHint({ canEdit }: { canEdit: boolean }) {
  return (
    <p className="text-muted-foreground/70 hidden text-[10px] md:block">
      Atajos: <Kbd>/</Kbd> buscar
      {canEdit ? (
        <>
          {" · "}
          <Kbd>N</Kbd> nueva
        </>
      ) : null}{" "}
      · <Kbd>A</Kbd> archivo
    </p>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-muted text-muted-foreground rounded border px-1 py-0.5 text-[10px] font-medium">
      {children}
    </kbd>
  );
}

function NewItemButton({
  open,
  onOpenChange,
  existingProjects,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  existingProjects: string[];
}) {
  const qc = useQueryClient();
  const [project, setProject] = React.useState("");
  const [title, setTitle] = React.useState("");

  const uniqueProjects = React.useMemo(
    () =>
      Array.from(new Set(existingProjects)).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
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
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function submit() {
    if (!project.trim() || !title.trim()) return;
    createMutation.mutate();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" title="Nueva tarea (N)">
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
            autoFocus
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
