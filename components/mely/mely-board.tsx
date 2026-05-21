"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Download,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import {
  createMelyGroupAction,
  createMelyProjectAction,
  deleteMelyGroupAction,
  reorderMelyItemsAction,
} from "@/app/actions/mely";
import { MelyGroupSection } from "@/components/mely/mely-group-section";
import {
  MELY_ITEMS_KEY,
  melyBoardKey,
  useMelyBoard,
} from "@/components/mely/use-mely-board";
import { FilterChips } from "@/components/tasks/filter-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { showToast } from "@/components/ui/toast";
import {
  MELY_ITEM_CATEGORIES,
  MELY_ITEM_CATEGORY_LABEL,
  MELY_ITEM_STATUSES,
  MELY_ITEM_STATUS_LABEL,
  type MelyDensityMode,
  type MelyGroup,
  type MelyItem,
  type MelyItemCategory,
  type MelyItemStatus,
  type MelyProjectMeta,
} from "@/lib/mely/types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = MELY_ITEM_STATUSES.map((s) => ({
  value: s,
  label: MELY_ITEM_STATUS_LABEL[s],
}));
const CATEGORY_OPTIONS = MELY_ITEM_CATEGORIES.map((c) => ({
  value: c,
  label: MELY_ITEM_CATEGORY_LABEL[c],
}));

type View = "active" | "archive";

/** Sentinel filter/group value for projects with no group assigned. */
const NO_GROUP = "__none__";

const selectClass = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "h-9 w-full rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
);

export function MelyBoard() {
  const canEdit = true;
  const [view, setView] = React.useState<View>("active");
  const query = useMelyBoard({ archiveMode: view });
  const qc = useQueryClient();

  const [statuses, setStatuses] = React.useState<MelyItemStatus[]>([
    ...MELY_ITEM_STATUSES,
  ]);
  const [categories, setCategories] = React.useState<MelyItemCategory[]>([
    ...MELY_ITEM_CATEGORIES,
  ]);
  const [selectedGroup, setSelectedGroup] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(true);
  const density: MelyDensityMode = "comfortable";
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const [newProjectGroup, setNewProjectGroup] = React.useState<string | null>(
    null,
  );
  const [newProjectKey, setNewProjectKey] = React.useState(0);

  const items = React.useMemo(
    () => query.data?.data.items ?? [],
    [query.data?.data.items],
  );
  const meta = React.useMemo(
    () => query.data?.data.meta ?? [],
    [query.data?.data.meta],
  );
  const groups = React.useMemo(
    () => query.data?.data.groups ?? [],
    [query.data?.data.groups],
  );
  const groupNames = React.useMemo(() => groups.map((g) => g.name), [groups]);
  const metaByProject = React.useMemo(() => {
    const map = new Map<string, MelyProjectMeta>();
    for (const m of meta) map.set(m.project, m);
    return map;
  }, [meta]);
  const groupByProject = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of meta) map.set(m.project, m.group ?? null);
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
    const map = new Map<string, MelyItem[]>();
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

  const groupSections = React.useMemo(() => {
    const byGroup = new Map<string, { project: string; items: MelyItem[] }[]>();
    for (const [project, list] of orderedGroups) {
      const key = groupByProject.get(project) ?? null;
      const bucket = key ?? NO_GROUP;
      if (!byGroup.has(bucket)) byGroup.set(bucket, []);
      byGroup.get(bucket)!.push({ project, items: list });
    }
    const order = new Map<string, number>();
    groups.forEach((g, i) => order.set(g.name, i));
    const entries = Array.from(byGroup.entries());
    entries.sort(([a], [b]) => {
      if (a === NO_GROUP) return 1;
      if (b === NO_GROUP) return -1;
      const pa = order.get(a) ?? 1e6;
      const pb = order.get(b) ?? 1e6;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b, "es");
    });
    return entries.map(([key, projects]) => ({
      key,
      group: key === NO_GROUP ? "Sin grupo" : key,
      projects: projects.map(({ project, items: list }) => ({
        project,
        meta: metaByProject.get(project),
        items: list,
      })),
    }));
  }, [orderedGroups, groupByProject, groups, metaByProject]);

  const hasUnassigned = React.useMemo(
    () => groupSections.some((g) => g.key === NO_GROUP),
    [groupSections],
  );

  const visibleGroupSections = React.useMemo(
    () =>
      selectedGroup === null
        ? groupSections
        : groupSections.filter((g) => g.key === selectedGroup),
    [groupSections, selectedGroup],
  );

  const focusedGroup =
    selectedGroup && selectedGroup !== NO_GROUP ? selectedGroup : null;

  const openNewProject = React.useCallback(
    (preset?: string | null) => {
      const def =
        preset !== undefined
          ? preset
          : selectedGroup && selectedGroup !== NO_GROUP
            ? selectedGroup
            : null;
      setNewProjectGroup(def);
      setNewProjectKey((k) => k + 1);
      setNewProjectOpen(true);
    },
    [selectedGroup],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // On touch, require a short press-and-hold before dragging so vertical
    // swipes scroll the list instead of accidentally reordering tasks.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorderItemsMutation = useMutation({
    mutationFn: async (vars: { project: string; ids: string[] }) => {
      const result = await reorderMelyItemsAction(vars);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: melyBoardKey({ archiveMode: view }) }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeItem = items.find((it) => it.id === activeId);
    const overItem = items.find((it) => it.id === overId);
    if (!activeItem || !overItem) return;
    if (activeItem.project !== overItem.project) return;

    const list = items.filter((it) => it.project === activeItem.project);
    const oldIdx = list.findIndex((it) => it.id === activeId);
    const newIdx = list.findIndex((it) => it.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;
    const nextIds = arrayMove(list, oldIdx, newIdx).map((it) => it.id);
    reorderItemsMutation.mutate({ project: activeItem.project, ids: nextIds });
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
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openNewProject();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setView((v) => (v === "active" ? "archive" : "active"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNewProject]);

  function exportCsv() {
    const rows = [
      ["project", "title", "category", "status", "due_date", "link", "description"],
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
    a.download = `board-mely-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inArchive = view === "archive";
  const hasSections = visibleGroupSections.length > 0;
  const filtersActive =
    search.trim().length > 0 ||
    statuses.length !== MELY_ITEM_STATUSES.length ||
    categories.length !== MELY_ITEM_CATEGORIES.length;

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {inArchive ? "Archivo · Board - Mely" : "Board - Mely"}
          </h1>
          <p className="text-muted-foreground text-xs">
            {inArchive
              ? "Tareas archivadas. Reactivá las que vuelvan a estar en juego."
              : "Elegí un grupo y creá sus proyectos; dentro de cada proyecto cargás las tareas."}
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
              className="h-9 w-36 pl-7 sm:w-44 md:w-56"
            />
          </div>

          {/* Desktop toolbar */}
          <div className="hidden items-center gap-1.5 md:flex">
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
              variant={showFilters ? "outline" : "default"}
              size="sm"
              onClick={() => setShowFilters((v) => !v)}
              title={showFilters ? "Ocultar filtros" : "Mostrar filtros"}
            >
              <SlidersHorizontal />
              Filtros
            </Button>
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
          </div>

          {/* Mobile: collapse secondary actions into an overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label="Más acciones"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setView(inArchive ? "active" : "archive")}
              >
                <Archive className="size-4" />
                {inArchive ? "Volver al activo" : "Ver archivo"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowFilters((v) => !v)}>
                <SlidersHorizontal className="size-4" />
                {showFilters ? "Ocultar filtros" : "Mostrar filtros"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportCsv}
                disabled={items.length === 0}
              >
                <Download className="size-4" />
                Exportar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {!inArchive ? (
            <Button
              type="button"
              onClick={() => openNewProject()}
              title="Nuevo proyecto (N)"
            >
              <FolderPlus />
              <span className="hidden sm:inline">Nuevo proyecto</span>
              <span className="sm:hidden">Nuevo</span>
            </Button>
          ) : null}
        </div>
      </header>

      <GroupFilterBar
        groups={groups}
        selected={selectedGroup}
        onSelect={setSelectedGroup}
        hasUnassigned={hasUnassigned}
        canManage={canEdit && !inArchive}
      />

      {showFilters ? (
        <div className="flex flex-col gap-2">
          <FilterChips<MelyItemStatus>
            label="Status"
            options={STATUS_OPTIONS}
            selected={statuses}
            onChange={setStatuses}
          />
          <FilterChips<MelyItemCategory>
            label="Categoría"
            options={CATEGORY_OPTIONS}
            selected={categories}
            onChange={setCategories}
          />
        </div>
      ) : null}

      {query.data?.error ? (
        <p className="text-destructive text-sm" role="alert">
          {query.data.error}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando board…</p>
      ) : !hasSections ? (
        focusedGroup && !inArchive && !filtersActive ? (
          <GroupEmptyState
            group={focusedGroup}
            onNewProject={() => openNewProject(focusedGroup)}
          />
        ) : (
          <EmptyState hasItems={items.length > 0} archive={inArchive} />
        )
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-4">
            {visibleGroupSections.map((gs) => (
              <MelyGroupSection
                key={gs.key}
                groupKey={gs.key === NO_GROUP ? null : gs.key}
                group={gs.group}
                projects={gs.projects}
                canEdit={canEdit && !inArchive}
                density={density}
                groupNames={groupNames}
                onNewProject={openNewProject}
                admin={canEdit}
                inArchive={inArchive}
              />
            ))}
          </div>
        </DndContext>
      )}

      <NewProjectDialog
        key={newProjectKey}
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        groups={groupNames}
        defaultGroup={newProjectGroup}
      />

      <KeyboardHint />
    </section>
  );
}

function GroupFilterBar({
  groups,
  selected,
  onSelect,
  hasUnassigned,
  canManage,
}: {
  groups: MelyGroup[];
  selected: string | null;
  onSelect: (next: string | null) => void;
  hasUnassigned: boolean;
  canManage: boolean;
}) {
  function pillClass(active: boolean) {
    return cn(
      "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background hover:bg-accent",
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
        Grupo
      </span>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={pillClass(selected === null)}
      >
        Todos
      </button>

      {groups.map((g) => (
        <button
          key={g.name}
          type="button"
          onClick={() => onSelect(g.name)}
          className={cn(pillClass(selected === g.name), "max-w-[14rem] truncate")}
        >
          {g.name}
        </button>
      ))}

      {hasUnassigned ? (
        <button
          type="button"
          onClick={() => onSelect(NO_GROUP)}
          className={pillClass(selected === NO_GROUP)}
        >
          Sin grupo
        </button>
      ) : null}

      {canManage ? (
        <ManageGroups groups={groups} selected={selected} onSelect={onSelect} />
      ) : null}
    </div>
  );
}

function ManageGroups({
  groups,
  selected,
  onSelect,
}: {
  groups: MelyGroup[];
  selected: string | null;
  onSelect: (next: string | null) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const createMutation = useMutation({
    mutationFn: async (n: string) => {
      const result = await createMelyGroupAction(n);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      setName("");
      qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY });
      onSelect(data.name);
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (n: string) => {
      const result = await deleteMelyGroupAction(n);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY });
      if (selected === data.name) onSelect(null);
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function add() {
    const trimmed = name.trim();
    if (trimmed) createMutation.mutate(trimmed);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-7 gap-1.5 px-2"
          title="Gestionar grupos"
        >
          <Layers className="size-3.5" />
          Gestionar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="text-xs font-medium">Gestionar grupos</div>
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Nuevo grupo…"
            className="h-9"
          />
          <Button
            type="button"
            size="icon"
            onClick={add}
            disabled={!name.trim() || createMutation.isPending}
            aria-label="Agregar grupo"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {groups.length > 0 ? (
          <ul className="max-h-64 space-y-0.5 overflow-auto">
            {groups.map((g) => (
              <li
                key={g.name}
                className="hover:bg-accent flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
              >
                <span className="truncate text-sm">{g.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `¿Quitar el grupo "${g.name}"? Los proyectos asignados quedan sin grupo.`,
                      )
                    )
                      deleteMutation.mutate(g.name);
                  }}
                  aria-label={`Quitar ${g.name}`}
                  className="text-muted-foreground hover:text-destructive inline-flex size-5 shrink-0 items-center justify-center rounded"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            Todavía no hay grupos. Agregá el primero arriba.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
  groups,
  defaultGroup,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  groups: string[];
  defaultGroup: string | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState<MelyItemCategory>("otros");
  const [group, setGroup] = React.useState<string>(defaultGroup ?? "");

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createMelyProjectAction({
        name: name.trim(),
        group: group || null,
        title: title.trim(),
        category,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const canSubmit =
    name.trim().length > 0 &&
    title.trim().length > 0 &&
    !createMutation.isPending;

  function submit() {
    if (!canSubmit) return;
    createMutation.mutate();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo proyecto"
      description="Creá el proyecto y su primera tarea. Después sumás más tareas dentro del proyecto."
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Grupo
          </label>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className={selectClass}
            aria-label="Grupo del proyecto"
          >
            <option value="">Sin grupo</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Nombre del proyecto
          </label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Campaña Verano"
          />
        </div>

        <div className="space-y-1">
          <label className="text-muted-foreground text-xs font-medium">
            Primera tarea
          </label>
          <div className="flex items-center gap-2">
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
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as MelyItemCategory)
              }
              className={cn(selectClass, "w-28")}
              aria-label="Categoría"
            >
              {MELY_ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {MELY_ITEM_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            Crear proyecto
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function GroupEmptyState({
  group,
  onNewProject,
}: {
  group: string;
  onNewProject: () => void;
}) {
  return (
    <div className="bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div>
        <p className="text-sm font-medium">
          «{group}» todavía no tiene proyectos
        </p>
        <p className="text-muted-foreground text-xs">
          Creá el primer proyecto de este grupo para arrancar a cargar tareas.
        </p>
      </div>
      <Button type="button" onClick={onNewProject}>
        <FolderPlus />
        Nuevo proyecto
      </Button>
    </div>
  );
}

function EmptyState({
  hasItems,
  archive,
}: {
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
            : "Sin proyectos todavía"}
      </p>
      <p className="text-muted-foreground text-xs">
        {hasItems
          ? "Probá quitar filtros o limpiar la búsqueda."
          : archive
            ? "Cuando archives tareas las vas a ver acá."
            : "Tocá Nuevo proyecto o presioná N para arrancar."}
      </p>
    </div>
  );
}

function KeyboardHint() {
  return (
    <p className="text-muted-foreground/70 hidden text-[10px] md:block">
      Atajos: <Kbd>/</Kbd> buscar · <Kbd>N</Kbd> nuevo proyecto · <Kbd>A</Kbd>{" "}
      archivo
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
