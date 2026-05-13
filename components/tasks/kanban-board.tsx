"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateTaskAction } from "@/app/actions/tasks";
import { TaskCard } from "@/components/tasks/task-card";
import { TASKS_INVALIDATION_KEY } from "@/components/tasks/use-tasks";
import { showToast } from "@/components/ui/toast";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type Task,
  type TaskStatus,
} from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  todo: "border-t-muted-foreground/40",
  in_progress: "border-t-sky-500",
  review: "border-t-amber-500",
  done: "border-t-emerald-500",
};

type KanbanBoardProps = {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
};

export function KanbanBoard({ tasks, onSelectTask }: KanbanBoardProps) {
  const queryClient = useQueryClient();
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  // Local optimistic state — moves tasks immediately while the mutation runs.
  const [overrides, setOverrides] = React.useState<Map<string, TaskStatus>>(
    () => new Map(),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const moveMutation = useMutation({
    mutationFn: async (input: { id: string; status: TaskStatus }) => {
      const result = await updateTaskAction({
        id: input.id,
        status: input.status,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async (_, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: TASKS_INVALIDATION_KEY }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
      ]);
      // Drop the optimistic override once the server is in sync.
      setOverrides((prev) => {
        if (!prev.has(vars.id)) return prev;
        const next = new Map(prev);
        next.delete(vars.id);
        return next;
      });
    },
    onError: (err: Error, vars) => {
      // Roll back the optimistic update.
      setOverrides((prev) => {
        if (!prev.has(vars.id)) return prev;
        const next = new Map(prev);
        next.delete(vars.id);
        return next;
      });
      showToast({ title: "No se pudo mover", description: err.message });
    },
  });

  const tasksByStatus = React.useMemo(() => {
    const groups = new Map<TaskStatus, Task[]>();
    for (const s of TASK_STATUSES) groups.set(s, []);
    for (const task of tasks) {
      const status = overrides.get(task.id) ?? task.status;
      groups.get(status)!.push({ ...task, status });
    }
    return groups;
  }, [tasks, overrides]);

  const activeTask = React.useMemo(() => {
    if (!activeTaskId) return null;
    return (
      tasks.find((t) => t.id === activeTaskId) ?? null
    );
  }, [activeTaskId, tasks]);

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTaskId(null);
    const { active, over } = event;
    if (!over) return;
    const targetStatus = over.id as TaskStatus;
    if (!TASK_STATUSES.includes(targetStatus)) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentStatus = overrides.get(taskId) ?? task.status;
    if (currentStatus === targetStatus) return;

    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(taskId, targetStatus);
      return next;
    });
    moveMutation.mutate({ id: taskId, status: targetStatus });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTaskId(null)}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            accent={COLUMN_ACCENT[status]}
            tasks={tasksByStatus.get(status) ?? []}
            onSelectTask={onSelectTask}
            activeTaskId={activeTaskId}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  accent,
  tasks,
  onSelectTask,
  activeTaskId,
}: {
  status: TaskStatus;
  accent: string;
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  activeTaskId: string | null;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-muted/30 flex min-h-[200px] flex-col gap-2 rounded-lg border border-t-4 p-2 transition-colors",
        accent,
        isOver && "bg-muted/60",
      )}
    >
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider">
          {TASK_STATUS_LABEL[status]}
        </h3>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            isDragging={activeTaskId === task.id}
            onSelect={onSelectTask}
          />
        ))}
        {tasks.length === 0 ? (
          <p className="text-muted-foreground px-1 py-3 text-center text-[11px]">
            Sin tareas
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DraggableTaskCard({
  task,
  isDragging,
  onSelect,
}: {
  task: Task;
  isDragging: boolean;
  onSelect: (task: Task) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // The DragOverlay renders the floating clone; hide the original while dragging.
      className={cn(isDragging && "invisible")}
    >
      <TaskCard task={task} onClick={() => onSelect(task)} />
    </div>
  );
}
