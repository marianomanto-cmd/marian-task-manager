"use client";

import * as React from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Palette,
  Trash2,
} from "lucide-react";

import {
  archiveNadineProjectAction,
  deleteNadineProjectAction,
  renameNadineProjectAction,
  updateNadineMetaAction,
} from "@/app/actions/nadine";
import { NadineAvatar } from "@/components/nadine/nadine-avatar";
import { NadineItemRow } from "@/components/nadine/nadine-item-row";
import { NadineMetaEditor } from "@/components/nadine/nadine-meta-editor";
import { NadineQuickAddRow } from "@/components/nadine/nadine-quick-add-row";
import { NADINE_ITEMS_KEY } from "@/components/nadine/use-nadine-board";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  NADINE_COLOR_CLASS,
  NADINE_ITEM_STATUS_DOT,
  NADINE_ITEM_STATUS_LABEL,
  defaultNadineMeta,
  nadinePickStableColor,
  type NadineColor,
  type NadineDensityMode,
  type NadineItem,
  type NadineItemStatus,
  type NadineProjectMeta,
} from "@/lib/nadine/types";
import { cn } from "@/lib/utils";

const STATUS_ORDER: NadineItemStatus[] = [
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
      const result = await renameNadineProjectAction({ from: project, to });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: NADINE_ITEMS_KEY });
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
        className="h-8 w-full text-sm font-semibold"
      />
    );
  }

  if (!canEdit) {
    return (
      <h2 className="text-sm font-semibold tracking-tight break-words">
        {project}
      </h2>
    );
  }

  return (
    <h2 className="min-w-0">
      <button
        type="button"
        onClick={beginEdit}
        className="-mx-1 w-full cursor-text rounded px-1 text-left text-sm font-semibold tracking-tight break-words hover:bg-foreground/5"
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
  group,
  groupNames,
}: {
  project: string;
  color: NadineColor;
  emoji: string | null;
  group: string | null;
  groupNames: string[];
}) {
  const qc = useQueryClient();

  const groupMutation = useMutation({
    mutationFn: async (next: string | null) => {
      const result = await updateNadineMetaAction({ project, group: next });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NADINE_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteNadineProjectAction(project);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: NADINE_ITEMS_KEY });
      showToast({
        title: `${data.project} eliminado (${data.count} tareas).`,
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  return (
    <>
      <NadineMetaEditor
        project={project}
        color={color}
        emoji={emoji}
        trigger={
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Color y emoji"
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Layers className="size-3.5" />
              Grupo
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className="text-muted-foreground text-[11px]">
                Mover a…
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={group ?? ""}
                onValueChange={(v) => groupMutation.mutate(v || null)}
              >
                <DropdownMenuRadioItem value="">
                  Sin grupo
                </DropdownMenuRadioItem>
                {groupNames.map((g) => (
                  <DropdownMenuRadioItem key={g} value={g}>
                    {g}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
    </>
  );
}

type GroupProject = {
  project: string;
  meta: NadineProjectMeta | undefined;
  items: NadineItem[];
};

function ProjectBlock({
  project,
  meta,
  items,
  canEdit,
  density,
  groupNames,
  admin,
  inArchive,
}: {
  project: string;
  meta: NadineProjectMeta | undefined;
  items: NadineItem[];
  canEdit: boolean;
  density: NadineDensityMode;
  groupNames: string[];
  admin: boolean;
  inArchive: boolean;
}) {
  const [open, setOpen] = React.useState(true);
  const qc = useQueryClient();
  const pm = meta ?? defaultNadineMeta(project);

  const stats = React.useMemo(() => {
    const counts: Record<NadineItemStatus, number> = {
      pending: 0,
      ongoing: 0,
      waiting: 0,
      done: 0,
    };
    for (const it of items) counts[it.status]++;
    return counts;
  }, [items]);

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const result = await archiveNadineProjectAction({
        project,
        archive: !inArchive,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: NADINE_ITEMS_KEY });
      showToast({
        title: inArchive
          ? `${data.project} reactivado (${data.count} tareas).`
          : `${data.project} archivado (${data.count} tareas).`,
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const palette = NADINE_COLOR_CLASS[pm.color];

  return (
    <div>
      <div
        className={cn(
          "relative flex items-center gap-2 border-b py-2 pr-3 pl-4",
          palette.soft,
        )}
      >
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0 w-[3px]", palette.bar)}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded md:size-6"
          aria-label={open ? "Colapsar proyecto" : "Expandir proyecto"}
          aria-expanded={open}
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        <NadineAvatar
          project={project}
          color={pm.color}
          emoji={pm.emoji}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <ProjectName project={project} canEdit={canEdit} />
        </div>
        {!open ? (
          <div className="hidden items-center gap-1.5 sm:flex">
            {STATUS_ORDER.map((s) =>
              stats[s] > 0 ? (
                <span
                  key={s}
                  className="text-muted-foreground inline-flex items-center gap-1 text-[11px]"
                  title={NADINE_ITEM_STATUS_LABEL[s]}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      NADINE_ITEM_STATUS_DOT[s],
                    )}
                  />
                  {stats[s]}
                </span>
              ) : null,
            )}
          </div>
        ) : null}
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {items.length}
        </span>
        {admin ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            aria-label={inArchive ? "Reactivar proyecto" : "Archivar proyecto"}
            title={inArchive ? "Reactivar proyecto" : "Archivar proyecto"}
          >
            {inArchive ? (
              <ArchiveRestore className="size-3.5" />
            ) : (
              <Archive className="size-3.5" />
            )}
          </Button>
        ) : null}
        {canEdit ? (
          <GroupMenu
            project={project}
            color={pm.color}
            emoji={pm.emoji}
            group={pm.group ?? null}
            groupNames={groupNames}
          />
        ) : null}
      </div>
      {open ? (
        <div className="animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <SortableContext
            items={items.map((it) => it.id)}
            strategy={verticalListSortingStrategy}
          >
            {items.map((item) => (
              <NadineItemRow
                key={item.id}
                item={item}
                density={density}
                canEdit={canEdit}
                draggable={canEdit}
              />
            ))}
          </SortableContext>
          {canEdit ? <NadineQuickAddRow project={project} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function NadineGroupSection({
  groupKey,
  group,
  projects,
  canEdit,
  density,
  groupNames = [],
  onNewProject,
  admin = false,
  inArchive = false,
  defaultOpen = true,
}: {
  groupKey: string | null;
  group: string;
  projects: GroupProject[];
  canEdit: boolean;
  density: NadineDensityMode;
  groupNames?: string[];
  onNewProject?: (group: string | null) => void;
  admin?: boolean;
  inArchive?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const color = nadinePickStableColor(group);
  const palette = NADINE_COLOR_CLASS[color];

  const allItems = React.useMemo(
    () => projects.flatMap((p) => p.items),
    [projects],
  );

  const stats = React.useMemo(() => {
    const counts: Record<NadineItemStatus, number> = {
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
          "flex items-center gap-2.5 border-b px-3 py-3 md:px-4",
          palette.soft,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen((v) => !v)}
          className="size-8 shrink-0 md:size-7"
          aria-label={open ? "Colapsar" : "Expandir"}
        >
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </Button>

        <NadineAvatar project={group} color={color} emoji={null} size="md" />

        <h2 className="truncate text-base font-semibold tracking-tight md:text-lg">
          {group}
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
                title={NADINE_ITEM_STATUS_LABEL[s]}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    NADINE_ITEM_STATUS_DOT[s],
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
        <div className="animate-in fade-in-0 duration-150">
          {projects.map(({ project, meta, items }) => (
            <ProjectBlock
              key={project}
              project={project}
              meta={meta}
              items={items}
              canEdit={canEdit}
              density={density}
              groupNames={groupNames}
              admin={admin}
              inArchive={inArchive}
            />
          ))}
          {canEdit && onNewProject ? (
            <button
              type="button"
              onClick={() => onNewProject(groupKey)}
              className="text-muted-foreground hover:text-foreground hover:bg-accent/50 flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors"
            >
              <FolderPlus className="size-3.5" />
              Nuevo proyecto
              {group && groupKey !== null ? (
                <span className="text-muted-foreground/70 truncate">
                  en {group}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
