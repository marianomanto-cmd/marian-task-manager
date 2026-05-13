"use client";

import * as React from "react";
import { Archive, Kanban, List, ListChecks, Plus, RefreshCw } from "lucide-react";

import { FilterChips } from "@/components/tasks/filter-chips";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskRow } from "@/components/tasks/task-row";
import { useTasks } from "@/components/tasks/use-tasks";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = TASK_STATUSES.map((s) => ({
  value: s,
  label: TASK_STATUS_LABEL[s],
}));
const PRIORITY_OPTIONS = TASK_PRIORITIES.map((p) => ({
  value: p,
  label: TASK_PRIORITY_LABEL[p],
}));

const DEFAULT_STATUSES: TaskStatus[] = [...TASK_STATUSES];
const DEFAULT_PRIORITIES: TaskPriority[] = [...TASK_PRIORITIES];

type ViewMode = "list" | "kanban";

export default function TasksPage() {
  const [view, setView] = React.useState<ViewMode>("list");
  const [statuses, setStatuses] = React.useState<TaskStatus[]>(DEFAULT_STATUSES);
  const [priorities, setPriorities] =
    React.useState<TaskPriority[]>(DEFAULT_PRIORITIES);
  const [archiveMode, setArchiveMode] = React.useState<"active" | "archive">(
    "active",
  );
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);

  // Kanban view always shows all open statuses — the columns ARE the filter.
  const effectiveStatuses = view === "kanban" ? [...TASK_STATUSES] : statuses;

  const tasksQuery = useTasks({
    statuses: effectiveStatuses,
    priorities,
    archiveMode,
  });
  const tasks = tasksQuery.data?.tasks ?? [];

  function openCreate() {
    setEditingTask(null);
    setFormOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setFormOpen(true);
  }

  const filteringEmpty =
    view === "list" && (statuses.length === 0 || priorities.length === 0);
  const inArchive = archiveMode === "archive";

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 md:px-6 md:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {inArchive ? "Archivo de tareas" : "Tareas"}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {!inArchive ? (
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="list">
                  <List className="size-3.5" />
                  Lista
                </TabsTrigger>
                <TabsTrigger value="kanban">
                  <Kanban className="size-3.5" />
                  Kanban
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          <Button
            type="button"
            variant={inArchive ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setArchiveMode((m) => (m === "active" ? "archive" : "active"))
            }
          >
            <Archive />
            {inArchive ? "Volver al activo" : "Archivadas"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => tasksQuery.refetch()}
            disabled={tasksQuery.isFetching}
            aria-label="Actualizar"
          >
            <RefreshCw
              className={cn(tasksQuery.isFetching && "animate-spin")}
            />
          </Button>
          {!inArchive ? (
            <Button
              type="button"
              onClick={openCreate}
              className="hidden md:inline-flex"
            >
              <Plus />
              Nueva tarea
            </Button>
          ) : null}
        </div>
      </header>

      {inArchive ? (
        <p className="text-muted-foreground text-xs">
          Tareas cerradas hace más de 7 días. Las podés reabrir desde el form
          (cambiá el estado a Por hacer).
        </p>
      ) : null}

      {view === "list" ? (
        <div className="flex flex-col gap-2">
          <FilterChips<TaskStatus>
            label="Estado"
            options={STATUS_OPTIONS}
            selected={statuses}
            onChange={setStatuses}
          />
          <FilterChips<TaskPriority>
            label="Prioridad"
            options={PRIORITY_OPTIONS}
            selected={priorities}
            onChange={setPriorities}
          />
        </div>
      ) : (
        <FilterChips<TaskPriority>
          label="Prioridad"
          options={PRIORITY_OPTIONS}
          selected={priorities}
          onChange={setPriorities}
        />
      )}

      {tasksQuery.data?.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          Iniciá sesión para ver las tareas.
        </p>
      ) : null}
      {tasksQuery.data?.error && !tasksQuery.data.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          {tasksQuery.data.error}
        </p>
      ) : null}

      {tasksQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando tareas…</p>
      ) : view === "kanban" ? (
        <KanbanBoard tasks={tasks} onSelectTask={openEdit} />
      ) : tasks.length === 0 ? (
        <div className="bg-muted/30 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <ListChecks className="text-muted-foreground size-8" />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {filteringEmpty
                ? "Activá al menos un estado y una prioridad"
                : inArchive
                  ? "No hay tareas archivadas"
                  : "No hay tareas todavía"}
            </p>
            <p className="text-muted-foreground text-xs">
              {filteringEmpty
                ? "El filtro actual deja la lista vacía."
                : inArchive
                  ? "Las tareas cerradas hace menos de 7 días siguen en el activo."
                  : "Tocá Nueva tarea para empezar."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onSelect={openEdit} />
          ))}
        </ul>
      )}

      {!inArchive ? (
        <Button
          type="button"
          onClick={openCreate}
          className="fixed right-4 bottom-20 z-30 size-12 rounded-full shadow-lg md:hidden"
          size="icon"
          aria-label="Nueva tarea"
        >
          <Plus />
        </Button>
      ) : null}

      <ResponsiveDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingTask(null);
        }}
        title={editingTask ? "Editar tarea" : "Nueva tarea"}
        description={
          editingTask
            ? "Editá los datos, comentá o eliminá."
            : "Sumá una tarea a la lista."
        }
        contentClassName="sm:max-w-2xl"
      >
        <TaskForm
          task={editingTask}
          onSaved={() => setFormOpen(false)}
          onDeleted={() => setFormOpen(false)}
          onCancel={() => setFormOpen(false)}
        />
      </ResponsiveDialog>
    </section>
  );
}
