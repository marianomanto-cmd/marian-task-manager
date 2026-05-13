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
      setOverrides((prev) => {
        if (!prev.has(vars.id)) return prev;
        const next = new Map(prev);
        next.delete(vars.id);
        return next;
      });
    },
    onError: (err: Error, vars) => {
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

const COLUMN_COUNT_BADGE: Record<TaskStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-500/15 text-sky-700 dark:text-sky-200",
  review: "bg-amber-500/15 text-amber-700 dark:text-amber-200",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
};

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
        "bg-muted/30 flex min-h-[260px] flex-col gap-3 rounded-xl border border-t-4 p-3 transition-colors",
        accent,
        isOver && "bg-muted/60 ring-ring/30 ring-2",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider">
          {TASK_STATUS_LABEL[status]}
        </h3>
        <span
          className={cn(
            "inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            COLUMN_COUNT_BADGE[status],
          )}
        >
          {tasks.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            isDragging={activeTaskId === task.id}
            onSelect={onSelectTask}
          />
        ))}
        {tasks.length === 0 ? (
          <div className="border-muted-foreground/20 text-muted-foreground rounded-lg border border-dashed px-2 py-6 text-center text-[11px]">
            Sin tareas
          </div>
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
      className={cn(isDragging && "invisible")}
    >
      <TaskCard task={task} onClick={() => onSelect(task)} />
    </div>
  );
}
