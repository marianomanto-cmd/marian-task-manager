"use client";

import * as React from "react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  ExternalLink,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteProjectItemAction,
  updateProjectItemAction,
} from "@/app/actions/projects";
import { PROJECT_ITEMS_KEY } from "@/components/projects/use-project-items";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  PROJECT_ITEM_CATEGORIES,
  PROJECT_ITEM_CATEGORY_CLASS,
  PROJECT_ITEM_CATEGORY_LABEL,
  PROJECT_ITEM_STATUSES,
  PROJECT_ITEM_STATUS_CLASS,
  PROJECT_ITEM_STATUS_DOT,
  PROJECT_ITEM_STATUS_LABEL,
  type ProjectItem,
  type ProjectItemCategory,
  type ProjectItemStatus,
} from "@/lib/projects/types";
import { cn } from "@/lib/utils";

export function ProjectItemRow({ item }: { item: ProjectItem }) {
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<ProjectItem>) => {
      const result = await updateProjectItemAction({ id: item.id, ...patch });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteProjectItemAction(item.id);
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECT_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const isDone = item.status === "done";

  return (
    <div
      className={cn(
        "group grid grid-cols-[1fr_120px_120px_120px_44px] items-center gap-3 border-b px-3 py-2.5 transition-colors hover:bg-muted/40 md:grid-cols-[1fr_140px_140px_140px_44px]",
        isDone && "text-muted-foreground",
      )}
    >
      <TitleCell
        value={item.title}
        link={item.link}
        done={isDone}
        onSave={(title) => updateMutation.mutate({ title })}
        onLink={(link) => updateMutation.mutate({ link })}
      />
      <CategoryCell
        value={item.category}
        onChange={(category) => updateMutation.mutate({ category })}
      />
      <StatusCell
        value={item.status}
        onChange={(status) => updateMutation.mutate({ status })}
      />
      <DueDateCell
        value={item.due_date}
        onChange={(due_date) => updateMutation.mutate({ due_date })}
      />
      <RowMenu
        item={item}
        onDelete={() => deleteMutation.mutate()}
        onToggleDone={() =>
          updateMutation.mutate({ status: isDone ? "pending" : "done" })
        }
      />
    </div>
  );
}

function TitleCell({
  value,
  link,
  done,
  onSave,
  onLink,
}: {
  value: string;
  link: string | null;
  done: boolean;
  onSave: (next: string) => void;
  onLink: (next: string | null) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkDraft, setLinkDraft] = React.useState(link ?? "");

  function beginEdit() {
    setDraft(value);
    setEditing(true);
  }

  function openLink(next: boolean) {
    if (next) setLinkDraft(link ?? "");
    setLinkOpen(next);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  }

  function saveLink() {
    setLinkOpen(false);
    const trimmed = linkDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next !== (link ?? null)) onLink(next);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {editing ? (
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
              setDraft(value);
              setEditing(false);
            }
          }}
          className="h-8 text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          className={cn(
            "truncate text-left text-sm",
            done && "line-through",
          )}
          title={value}
        >
          {value}
        </button>
      )}
      <Popover open={linkOpen} onOpenChange={openLink}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "size-7 shrink-0",
              link
                ? "text-sky-600 dark:text-sky-300"
                : "text-muted-foreground/40 opacity-0 group-hover:opacity-100",
            )}
            aria-label={link ? "Editar link" : "Agregar link"}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2" align="start">
          <div className="text-xs font-medium">Link asociado</div>
          <Input
            placeholder="https://…"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveLink();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-sky-600 underline dark:text-sky-300"
              >
                Abrir actual ↗
              </a>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" onClick={saveLink}>
              Guardar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CategoryCell({
  value,
  onChange,
}: {
  value: ProjectItemCategory;
  onChange: (next: ProjectItemCategory) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-medium uppercase tracking-wide",
            PROJECT_ITEM_CATEGORY_CLASS[value],
          )}
        >
          {PROJECT_ITEM_CATEGORY_LABEL[value]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PROJECT_ITEM_CATEGORIES.map((c) => (
          <DropdownMenuItem key={c} onClick={() => onChange(c)}>
            <span
              className={cn(
                "mr-2 inline-block size-2 rounded-full border",
                PROJECT_ITEM_CATEGORY_CLASS[c],
              )}
            />
            {PROJECT_ITEM_CATEGORY_LABEL[c]}
            {c === value ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusCell({
  value,
  onChange,
}: {
  value: ProjectItemStatus;
  onChange: (next: ProjectItemStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium",
            PROJECT_ITEM_STATUS_CLASS[value],
          )}
        >
          <span
            className={cn("size-1.5 rounded-full", PROJECT_ITEM_STATUS_DOT[value])}
          />
          {PROJECT_ITEM_STATUS_LABEL[value]}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PROJECT_ITEM_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(s)}>
            <span
              className={cn("mr-2 size-2 rounded-full", PROJECT_ITEM_STATUS_DOT[s])}
            />
            {PROJECT_ITEM_STATUS_LABEL[s]}
            {s === value ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueDateCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");

  function handleOpen(next: boolean) {
    if (next) setDraft(value ?? "");
    setOpen(next);
  }

  const label = formatDueLabel(value);
  const tone = dueTone(value);

  function save() {
    setOpen(false);
    const next = draft.trim() || null;
    if (next !== value) onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium",
            tone,
          )}
        >
          <CalendarDays className="size-3" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-2" align="start">
        <div className="text-xs font-medium">Fecha límite</div>
        <Input
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          {value ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft("");
                onChange(null);
                setOpen(false);
              }}
            >
              Quitar
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" size="sm" onClick={save}>
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RowMenu({
  item,
  onDelete,
  onToggleDone,
}: {
  item: ProjectItem;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 opacity-0 group-hover:opacity-100"
          aria-label="Acciones"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs">
          {item.project}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleDone}>
          {item.status === "done" ? "Reabrir" : "Marcar como Done"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            if (confirm(`¿Eliminar "${item.title}"?`)) onDelete();
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDueLabel(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = parseISO(value);
  if (isToday(date)) return "Hoy";
  if (isTomorrow(date)) return "Mañana";
  return format(date, "d MMM", { locale: es });
}

function dueTone(value: string | null): string {
  if (!value) return "bg-muted/40 text-muted-foreground border-transparent";
  const date = parseISO(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return PROJECT_ITEM_STATUS_CLASS.pending;
  if (isToday(date) || isTomorrow(date))
    return "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-200";
  return "bg-muted/40 text-foreground border-border";
}
