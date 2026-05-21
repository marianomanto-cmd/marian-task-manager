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
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Download,
  FolderPlus,
  Plus,
  RefreshCw,
  Rows3,
  Search,
  Users,
  X,
} from "lucide-react";

import {
  createClientAction,
  createProjectAction,
  deleteClientAction,
  reorderProjectItemsAction,
} from "@/app/actions/projects";
import { ClientGroup } from "@/components/projects/project-group";
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
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { showToast } from "@/components/ui/toast";
import {
  PROJECT_ITEM_CATEGORIES,
  PROJECT_ITEM_CATEGORY_LABEL,
  PROJECT_ITEM_STATUSES,
  PROJECT_ITEM_STATUS_LABEL,
  type Client,
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

/** Sentinel filter/group value for projects with no client assigned. */
const NO_CLIENT = "__none__";

const selectClass = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "h-9 w-full rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]",
);

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
  const [selectedClient, setSelectedClient] = React.useState<string | null>(
    null,
  );
  const [search, setSearch] = React.useState("");
  const [density, setDensity] = React.useState<DensityMode>("comfortable");
  const searchRef = React.useRef<HTMLInputElement>(null);

  // Top-down creation: a single dialog creates a project + its first task,
  // optionally pre-scoped to a client. `newProjectClient` is the preset and
  // `newProjectKey` remounts the dialog on each open so its fields reset.
  const [newProjectOpen, setNewProjectOpen] = React.useState(false);
  const [newProjectClient, setNewProjectClient] = React.useState<string | null>(
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
  const clients = React.useMemo(
    () => query.data?.data.clients ?? [],
    [query.data?.data.clients],
  );
  const clientNames = React.useMemo(() => clients.map((c) => c.name), [clients]);
  const metaByProject = React.useMemo(() => {
    const map = new Map<string, ProjectMeta>();
    for (const m of meta) map.set(m.project, m);
    return map;
  }, [meta]);
  const clientByProject = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const m of meta) map.set(m.project, m.client ?? null);
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

  const clientGroups = React.useMemo(() => {
    const byClient = new Map<string, { project: string; items: ProjectItem[] }[]>();
    for (const [project, list] of orderedGroups) {
      const key = clientByProject.get(project) ?? null;
      const bucket = key ?? NO_CLIENT;
      if (!byClient.has(bucket)) byClient.set(bucket, []);
      byClient.get(bucket)!.push({ project, items: list });
    }
    const order = new Map<string, number>();
    clients.forEach((c, i) => order.set(c.name, i));
    const entries = Array.from(byClient.entries());
    entries.sort(([a], [b]) => {
      if (a === NO_CLIENT) return 1;
      if (b === NO_CLIENT) return -1;
      const pa = order.get(a) ?? 1e6;
      const pb = order.get(b) ?? 1e6;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b, "es");
    });
    return entries.map(([key, projects]) => ({
      key,
      client: key === NO_CLIENT ? "Sin cliente" : key,
      projects: projects.map(({ project, items: list }) => ({
        project,
        meta: metaByProject.get(project),
        items: list,
      })),
    }));
  }, [orderedGroups, clientByProject, clients, metaByProject]);

  const hasUnassigned = React.useMemo(
    () => clientGroups.some((g) => g.key === NO_CLIENT),
    [clientGroups],
  );

  const visibleClientGroups = React.useMemo(
    () =>
      selectedClient === null
        ? clientGroups
        : clientGroups.filter((g) => g.key === selectedClient),
    [clientGroups, selectedClient],
  );

  /** The concrete client currently in focus, or null for "Todos"/"Sin cliente". */
  const focusedClient =
    selectedClient && selectedClient !== NO_CLIENT ? selectedClient : null;

  const openNewProject = React.useCallback(
    (preset?: string | null) => {
      const def =
        preset !== undefined
          ? preset
          : selectedClient && selectedClient !== NO_CLIENT
            ? selectedClient
            : null;
      setNewProjectClient(def);
      setNewProjectKey((k) => k + 1);
      setNewProjectOpen(true);
    },
    [selectedClient],
  );

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
        openNewProject();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setView((v) => (v === "active" ? "archive" : "active"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, openNewProject]);

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

  const inArchive = view === "archive";
  const hasGroups = visibleClientGroups.length > 0;
  const filtersActive =
    search.trim().length > 0 ||
    statuses.length !== PROJECT_ITEM_STATUSES.length ||
    categories.length !== PROJECT_ITEM_CATEGORIES.length;

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            {inArchive ? "Archivo de proyectos" : "Proyectos"}
          </h1>
          <p className="text-muted-foreground text-xs">
            {inArchive
              ? "Tareas archivadas. Reactivá las que vuelvan a estar en juego."
              : "Elegí un cliente y creá sus proyectos; dentro de cada proyecto cargás las tareas. Visible para todo el equipo; sólo Mariano edita."}
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
            <Button
              type="button"
              onClick={() => openNewProject()}
              title="Nuevo proyecto (N)"
            >
              <FolderPlus />
              Nuevo proyecto
            </Button>
          ) : null}
        </div>
      </header>

      <ClientFilterBar
        clients={clients}
        selected={selectedClient}
        onSelect={setSelectedClient}
        hasUnassigned={hasUnassigned}
        canManage={canEdit && !inArchive}
      />

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
      ) : !hasGroups ? (
        focusedClient && canEdit && !inArchive && !filtersActive ? (
          <ClientEmptyState
            client={focusedClient}
            onNewProject={() => openNewProject(focusedClient)}
          />
        ) : (
          <EmptyState
            canEdit={canEdit}
            hasItems={items.length > 0}
            archive={inArchive}
          />
        )
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col gap-4">
            {visibleClientGroups.map((cg) => (
              <ClientGroup
                key={cg.key}
                clientKey={cg.key === NO_CLIENT ? null : cg.key}
                client={cg.client}
                projects={cg.projects}
                canEdit={canEdit && !inArchive}
                density={density}
                clientNames={clientNames}
                onNewProject={openNewProject}
              />
            ))}
          </div>
        </DndContext>
      )}

      {canEdit ? (
        <NewProjectDialog
          key={newProjectKey}
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          clients={clientNames}
          defaultClient={newProjectClient}
        />
      ) : null}

      <KeyboardHint canEdit={canEdit} />
    </section>
  );
}

function ClientFilterBar({
  clients,
  selected,
  onSelect,
  hasUnassigned,
  canManage,
}: {
  clients: Client[];
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
        Cliente
      </span>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className={pillClass(selected === null)}
      >
        Todos
      </button>

      {clients.map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onSelect(c.name)}
          className={cn(pillClass(selected === c.name), "max-w-[14rem] truncate")}
        >
          {c.name}
        </button>
      ))}

      {hasUnassigned ? (
        <button
          type="button"
          onClick={() => onSelect(NO_CLIENT)}
          className={pillClass(selected === NO_CLIENT)}
        >
          Sin cliente
        </button>
      ) : null}

      {canManage ? (
        <ManageClients clients={clients} selected={selected} onSelect={onSelect} />
      ) : null}
    </div>
  );
}

function ManageClients({
  clients,
  selected,
  onSelect,
}: {
  clients: Client[];
  selected: string | null;
  onSelect: (next: string | null) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const createMutation = useMutation({
    mutationFn: async (n: string) => {
      const result = await createClientAction(n);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      setName("");
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
      onSelect(data.name);
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (n: string) => {
      const result = await deleteClientAction(n);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
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
          title="Gestionar clientes"
        >
          <Users className="size-3.5" />
          Gestionar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="text-xs font-medium">Gestionar clientes</div>
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
            placeholder="Nuevo cliente…"
            className="h-9"
          />
          <Button
            type="button"
            size="icon"
            onClick={add}
            disabled={!name.trim() || createMutation.isPending}
            aria-label="Agregar cliente"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {clients.length > 0 ? (
          <ul className="max-h-64 space-y-0.5 overflow-auto">
            {clients.map((c) => (
              <li
                key={c.name}
                className="hover:bg-accent flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
              >
                <span className="truncate text-sm">{c.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `¿Quitar el cliente "${c.name}"? Los proyectos asignados quedan sin cliente.`,
                      )
                    )
                      deleteMutation.mutate(c.name);
                  }}
                  aria-label={`Quitar ${c.name}`}
                  className="text-muted-foreground hover:text-destructive inline-flex size-5 shrink-0 items-center justify-center rounded"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-xs">
            Todavía no hay clientes. Agregá el primero arriba.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
  clients,
  defaultClient,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  clients: string[];
  defaultClient: string | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [category, setCategory] =
    React.useState<ProjectItemCategory>("otros");
  const [client, setClient] = React.useState<string>(defaultClient ?? "");

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createProjectAction({
        name: name.trim(),
        client: client || null,
        title: title.trim(),
        category,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY });
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
            Cliente
          </label>
          <select
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className={selectClass}
            aria-label="Cliente del proyecto"
          >
            <option value="">Sin cliente</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
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
                setCategory(e.target.value as ProjectItemCategory)
              }
              className={cn(selectClass, "w-28")}
              aria-label="Categoría"
            >
              {PROJECT_ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {PROJECT_ITEM_CATEGORY_LABEL[c]}
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

function ClientEmptyState({
  client,
  onNewProject,
}: {
  client: string;
  onNewProject: () => void;
}) {
  return (
    <div className="bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <div>
        <p className="text-sm font-medium">
          «{client}» todavía no tiene proyectos
        </p>
        <p className="text-muted-foreground text-xs">
          Creá el primer proyecto de este cliente para arrancar a cargar tareas.
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
            : "Sin proyectos todavía"}
      </p>
      <p className="text-muted-foreground text-xs">
        {hasItems
          ? "Probá quitar filtros o limpiar la búsqueda."
          : archive
            ? "Cuando archives tareas las vas a ver acá."
            : canEdit
              ? "Tocá Nuevo proyecto o presioná N para arrancar."
              : "Cuando Mariano cargue proyectos los vas a ver acá."}
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
          <Kbd>N</Kbd> nuevo proyecto
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
