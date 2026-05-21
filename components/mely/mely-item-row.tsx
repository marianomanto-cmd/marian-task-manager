"use client";

/* eslint-disable react-hooks/refs -- @dnd-kit's useSortable returns ref-like
   values that the React 19 refs rule flags as "during render"; this is the
   library's documented usage and runs correctly. */

import * as React from "react";
import {
  addDays,
  addWeeks,
  format,
  isPast,
  isToday,
  isTomorrow,
  nextMonday,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Check,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  archiveMelyItemAction,
  deleteMelyItemAction,
  updateMelyItemAction,
} from "@/app/actions/mely";
import { MELY_ITEMS_KEY } from "@/components/mely/use-mely-board";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import {
  MELY_ITEM_CATEGORIES,
  MELY_ITEM_CATEGORY_DOT,
  MELY_ITEM_CATEGORY_LABEL,
  MELY_ITEM_STATUSES,
  MELY_ITEM_STATUS_BAR,
  MELY_ITEM_STATUS_CLASS,
  MELY_ITEM_STATUS_DOT,
  MELY_ITEM_STATUS_LABEL,
  type MelyDensityMode,
  type MelyItem,
  type MelyItemCategory,
  type MelyItemStatus,
} from "@/lib/mely/types";
import { cn } from "@/lib/utils";

type RowProps = {
  item: MelyItem;
  density: MelyDensityMode;
  canEdit: boolean;
  draggable?: boolean;
};

export function MelyItemRow({
  item,
  density,
  canEdit,
  draggable = true,
}: RowProps) {
  const sortable = useSortable({
    id: item.id,
    disabled: !canEdit || !draggable,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  const qc = useQueryClient();
  const isDone = item.status === "done";
  const isArchived = item.archived_at !== null;

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<MelyItem>) => {
      const result = await updateMelyItemAction({ id: item.id, ...patch });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (archive: boolean) => {
      const result = await archiveMelyItemAction(item.id, archive);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const result = await deleteMelyItemAction(item.id);
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const padY = density === "compact" ? "py-1" : "py-1.5";

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "group relative border-b transition-colors last:border-b-0 hover:bg-muted/40",
        sortable.isOver && "bg-accent/30",
        isDone && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          MELY_ITEM_STATUS_BAR[item.status],
        )}
      />

      {/* Desktop layout */}
      <div
        className={cn(
          "hidden gap-3 pl-4 pr-2 md:grid md:items-center",
          padY,
          density === "compact"
            ? "md:grid-cols-[16px_1fr_40px_120px_120px_36px]"
            : "md:grid-cols-[16px_1fr_44px_130px_130px_36px]",
        )}
      >
        {canEdit && draggable ? (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            className="text-muted-foreground/40 hover:text-foreground flex h-6 cursor-grab items-center justify-center active:cursor-grabbing"
            aria-label="Arrastrar"
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : (
          <span />
        )}

        <TitleCell
          value={item.title}
          description={item.description}
          link={item.link}
          done={isDone}
          canEdit={canEdit}
          onSave={(title) => updateMutation.mutate({ title })}
          onSaveDesc={(description) => updateMutation.mutate({ description })}
          onSaveLink={(link) => updateMutation.mutate({ link })}
        />
        <CategoryCell
          value={item.category}
          canEdit={canEdit}
          onChange={(category) => updateMutation.mutate({ category })}
        />
        <StatusCell
          value={item.status}
          canEdit={canEdit}
          onChange={(status) => updateMutation.mutate({ status })}
        />
        <DueDateCell
          value={item.due_date}
          canEdit={canEdit}
          onChange={(due_date) => updateMutation.mutate({ due_date })}
        />
        <RowMenu
          canEdit={canEdit}
          isArchived={isArchived}
          onArchive={() => archiveMutation.mutate(!isArchived)}
          onDelete={() => deleteMutation.mutate()}
          onToggleDone={() =>
            updateMutation.mutate({ status: isDone ? "pending" : "done" })
          }
        />
      </div>

      {/* Mobile card layout */}
      <div className="flex flex-col gap-2 pl-2 pr-2 py-3 md:hidden">
        <div className="flex items-start gap-1.5">
          {canEdit && draggable ? (
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              className="text-muted-foreground/50 -ml-0.5 mt-0.5 flex size-8 shrink-0 touch-none items-center justify-center rounded active:bg-accent active:cursor-grabbing"
              aria-label="Mantené presionado para arrastrar"
            >
              <GripVertical className="size-4" />
            </button>
          ) : null}
          <TitleCell
            value={item.title}
            description={item.description}
            link={item.link}
            done={isDone}
            canEdit={canEdit}
            mobile
            onSave={(title) => updateMutation.mutate({ title })}
            onSaveDesc={(description) => updateMutation.mutate({ description })}
            onSaveLink={(link) => updateMutation.mutate({ link })}
          />
          <RowMenu
            canEdit={canEdit}
            isArchived={isArchived}
            onArchive={() => archiveMutation.mutate(!isArchived)}
            onDelete={() => deleteMutation.mutate()}
            onToggleDone={() =>
              updateMutation.mutate({ status: isDone ? "pending" : "done" })
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusCell
            value={item.status}
            canEdit={canEdit}
            onChange={(status) => updateMutation.mutate({ status })}
          />
          <CategoryCell
            value={item.category}
            canEdit={canEdit}
            onChange={(category) => updateMutation.mutate({ category })}
          />
          <DueDateCell
            value={item.due_date}
            canEdit={canEdit}
            onChange={(due_date) => updateMutation.mutate({ due_date })}
          />
        </div>
      </div>
    </div>
  );
}

function TitleCell({
  value,
  description,
  link,
  done,
  canEdit,
  mobile = false,
  onSave,
  onSaveDesc,
  onSaveLink,
}: {
  value: string;
  description: string | null;
  link: string | null;
  done: boolean;
  canEdit: boolean;
  mobile?: boolean;
  onSave: (next: string) => void;
  onSaveDesc: (next: string | null) => void;
  onSaveLink: (next: string | null) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkDraft, setLinkDraft] = React.useState(link ?? "");
  const [descOpen, setDescOpen] = React.useState(false);
  const [descDraft, setDescDraft] = React.useState(description ?? "");

  function beginEdit() {
    if (!canEdit) return;
    setDraft(value);
    setEditing(true);
  }

  function openLink(next: boolean) {
    if (next) setLinkDraft(link ?? "");
    setLinkOpen(next);
  }

  function openDesc(next: boolean) {
    if (next) setDescDraft(description ?? "");
    setDescOpen(next);
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
    if (next !== (link ?? null)) onSaveLink(next);
  }

  function saveDesc() {
    setDescOpen(false);
    const trimmed = descDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next !== (description ?? null)) onSaveDesc(next);
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1.5", mobile && "flex-1")}
    >
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
        <div className="flex min-w-0 flex-1 flex-col">
          <button
            type="button"
            onClick={beginEdit}
            disabled={!canEdit}
            className={cn(
              "truncate text-left text-sm font-normal",
              done && "line-through opacity-70",
              !canEdit && "cursor-default",
              mobile && "whitespace-normal text-[15px] leading-snug",
            )}
            title={value}
          >
            {value}
          </button>
          {description && !mobile ? (
            <p className="text-muted-foreground truncate text-[11px]">
              {description}
            </p>
          ) : null}
          {description && mobile ? (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
              {description}
            </p>
          ) : null}
        </div>
      )}

      <Popover open={descOpen} onOpenChange={openDesc}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "size-7 shrink-0",
              description
                ? "text-foreground/60"
                : "text-muted-foreground/40 opacity-0 group-hover:opacity-100",
              !canEdit && !description && "hidden",
            )}
            aria-label={description ? "Editar nota" : "Agregar nota"}
            disabled={!canEdit && !description}
          >
            <span className="inline-flex size-3.5 items-center justify-center text-[11px] font-bold">
              i
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-2" align="start">
          <div className="text-xs font-medium">Nota / contexto</div>
          {canEdit ? (
            <>
              <Textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Información extra…"
                rows={4}
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={saveDesc}>
                  Guardar
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{description}</p>
          )}
        </PopoverContent>
      </Popover>

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
              !canEdit && !link && "hidden",
            )}
            aria-label={link ? "Abrir link" : "Agregar link"}
            disabled={!canEdit && !link}
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2" align="start">
          <div className="text-xs font-medium">Link asociado</div>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-sky-600 underline dark:text-sky-300"
            >
              {link} ↗
            </a>
          ) : null}
          {canEdit ? (
            <>
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
              <div className="flex justify-end gap-2">
                {link ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setLinkDraft("");
                      onSaveLink(null);
                      setLinkOpen(false);
                    }}
                  >
                    Quitar
                  </Button>
                ) : null}
                <Button type="button" size="sm" onClick={saveLink}>
                  Guardar
                </Button>
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function CategoryCell({
  value,
  canEdit,
  onChange,
}: {
  value: MelyItemCategory;
  canEdit: boolean;
  onChange: (next: MelyItemCategory) => void;
}) {
  const content = (
    <>
      <span
        className={cn("size-2.5 rounded-full", MELY_ITEM_CATEGORY_DOT[value])}
      />
      <span className="text-muted-foreground text-xs md:hidden">
        {MELY_ITEM_CATEGORY_LABEL[value]}
      </span>
    </>
  );

  if (!canEdit)
    return (
      <span
        className="flex h-8 items-center gap-1.5 md:h-6 md:justify-center"
        title={MELY_ITEM_CATEGORY_LABEL[value]}
      >
        {content}
      </span>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 md:h-6 md:justify-center"
          title={MELY_ITEM_CATEGORY_LABEL[value]}
          aria-label={`Categoría: ${MELY_ITEM_CATEGORY_LABEL[value]}`}
        >
          {content}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {MELY_ITEM_CATEGORIES.map((c) => (
          <DropdownMenuItem key={c} onClick={() => onChange(c)}>
            <span
              className={cn(
                "mr-2 inline-block size-2 rounded-full",
                MELY_ITEM_CATEGORY_DOT[c],
              )}
            />
            {MELY_ITEM_CATEGORY_LABEL[c]}
            {c === value ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusCell({
  value,
  canEdit,
  onChange,
}: {
  value: MelyItemStatus;
  canEdit: boolean;
  onChange: (next: MelyItemStatus) => void;
}) {
  const chip = (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium md:h-6 md:px-2",
        MELY_ITEM_STATUS_CLASS[value],
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", MELY_ITEM_STATUS_DOT[value])}
      />
      {MELY_ITEM_STATUS_LABEL[value]}
    </span>
  );

  if (!canEdit) return chip;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="text-left">
          {chip}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {MELY_ITEM_STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => onChange(s)}>
            <span
              className={cn("mr-2 size-2 rounded-full", MELY_ITEM_STATUS_DOT[s])}
            />
            {MELY_ITEM_STATUS_LABEL[s]}
            {s === value ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueDateCell({
  value,
  canEdit,
  onChange,
}: {
  value: string | null;
  canEdit: boolean;
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

  const chip = (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium md:h-6 md:px-2",
        tone,
      )}
    >
      <CalendarDays className="size-3" />
      {label}
    </span>
  );

  if (!canEdit) return chip;

  function applyShift(days: number) {
    const base = value ? parseISO(value) : startOfDay(new Date());
    const next = addDays(base, days);
    const iso = format(next, "yyyy-MM-dd");
    setDraft(iso);
    onChange(iso);
    setOpen(false);
  }

  function applyAbsolute(date: Date) {
    const iso = format(date, "yyyy-MM-dd");
    setDraft(iso);
    onChange(iso);
    setOpen(false);
  }

  function save() {
    setOpen(false);
    const next = draft.trim() || null;
    if (next !== value) onChange(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="text-left">
          {chip}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <div className="space-y-1">
          <div className="text-xs font-medium">Fecha límite</div>
          <Input
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <div>
          <div className="text-muted-foreground mb-1 text-[10px] font-medium uppercase tracking-wider">
            Snooze rápido
          </div>
          <div className="grid grid-cols-4 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1.5 text-[11px]"
              onClick={() => applyAbsolute(addDays(new Date(), 1))}
            >
              Mañana
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1.5 text-[11px]"
              onClick={() => applyAbsolute(nextMonday(new Date()))}
            >
              Próx. lun
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1.5 text-[11px]"
              onClick={() => applyShift(7)}
            >
              +1 sem
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-1.5 text-[11px]"
              onClick={() => applyAbsolute(addWeeks(new Date(), 2))}
            >
              +2 sem
            </Button>
          </div>
        </div>

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
  canEdit,
  isArchived,
  onArchive,
  onDelete,
  onToggleDone,
}: {
  canEdit: boolean;
  isArchived: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  if (!canEdit) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 opacity-60 group-hover:opacity-100 md:size-7 md:opacity-0"
          aria-label="Acciones"
        >
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onToggleDone}>
          <Check className="size-3.5" />
          Toggle Done
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive}>
          {isArchived ? (
            <>
              <ArchiveRestore className="size-3.5" />
              Reactivar
            </>
          ) : (
            <>
              <Archive className="size-3.5" />
              Archivar
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            if (confirm("¿Eliminar esta tarea?")) onDelete();
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
  const today = startOfDay(new Date());
  if (date < today && !isToday(date) && isPast(date))
    return "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-200";
  if (isToday(date) || isTomorrow(date))
    return "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-200";
  return "bg-muted/40 text-foreground border-border";
}
