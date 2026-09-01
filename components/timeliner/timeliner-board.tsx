"use client";

import * as React from "react";
import { addDays, format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  Download,
  Flag,
  Layers,
  LayoutGrid,
  Link2,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import {
  createTimelineAction,
  createTimelineDependencyAction,
  createTimelineGroupAction,
  createTimelineItemAction,
  deleteTimelineAction,
  deleteTimelineDependencyAction,
  deleteTimelineItemAction,
  renameTimelineAction,
  reorderTimelineItemsAction,
  rescheduleTimelineItemsAction,
  updateTimelineDependencyAction,
  updateTimelineSettingsAction,
  type TimelinerData,
} from "@/app/actions/timeliner";
import type { ActionResult } from "@/lib/actions/result";
import { ItemEditor } from "@/components/timeliner/item-editor";
import { MasterView } from "@/components/timeliner/master-view";
import {
  SvarGantt,
  type SvarGanttHandlers,
} from "@/components/timeliner/svar-gantt";
import { ShareTimelineButton } from "@/components/timeliner/share-timeline-button";
import {
  TIMELINER_KEY,
  useTimeliner,
  type TimelinerQueryResult,
} from "@/components/timeliner/use-timeliner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { showToast } from "@/components/ui/toast";
import { exportTimelineXlsx } from "@/lib/timeliner/export-xlsx";
import {
  TEMPLATE_ITEMS,
  defaultTemplateAnchor,
} from "@/lib/timeliner/template";
import {
  HOLIDAY_COUNTRIES,
  type TimelineItem,
  type TimelineItemKind,
} from "@/lib/timeliner/types";
import { cn } from "@/lib/utils";

/** Sentinel id for the cross-timeline MASTER tab. */
const MASTER_TAB = "__master__";

export function TimelinerBoard() {
  const query = useTimeliner();
  const qc = useQueryClient();

  const timelines = React.useMemo(
    () => query.data?.data.timelines ?? [],
    [query.data?.data.timelines],
  );
  const allItems = React.useMemo(
    () => query.data?.data.items ?? [],
    [query.data?.data.items],
  );
  const holidays = React.useMemo(
    () => query.data?.data.holidays ?? [],
    [query.data?.data.holidays],
  );
  const allGroups = React.useMemo(
    () => query.data?.data.groups ?? [],
    [query.data?.data.groups],
  );
  const allDependencies = React.useMemo(
    () => query.data?.data.dependencies ?? [],
    [query.data?.data.dependencies],
  );

  // `MASTER` is a view, not a timeline: it reads across all of them.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const masterMode = selectedId === MASTER_TAB;
  const selected = masterMode
    ? null
    : (timelines.find((t) => t.id === selectedId) ?? timelines[0] ?? null);

  const items = React.useMemo(
    () => (selected ? allItems.filter((i) => i.timeline_id === selected.id) : []),
    [allItems, selected],
  );
  const groups = React.useMemo(
    () => (selected ? allGroups.filter((g) => g.timeline_id === selected.id) : []),
    [allGroups, selected],
  );
  const dependencies = React.useMemo(
    () =>
      selected
        ? allDependencies.filter((d) => d.timeline_id === selected.id)
        : [],
    [allDependencies, selected],
  );

  const quickAddMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Sin timeline");
      const start = format(new Date(), "yyyy-MM-dd");
      const end = format(addDays(new Date(), 2), "yyyy-MM-dd");
      const res = await createTimelineItemAction({
        timeline_id: selected.id,
        group_id: null,
        title: "Nueva tarea",
        owner_key: null,
        start_date: start,
        end_date: end,
        kind: "task",
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  /**
   * Everything the chart reports, written straight through to Postgres.
   *
   * SVAR owns the on-screen state during a gesture — that is what makes the
   * drag feel immediate and what moves the successors of a link for us — so
   * these only persist the result. `mutate` without an optimistic patch is
   * deliberate: the chart already shows the new position, and re-feeding it
   * would fight the component for control of the same row.
   */
  /**
   * Rebuild counter for the chart. SVAR owns its state once mounted and
   * deliberately ignores new props, so the only way to make it forget an edit
   * the server refused is to mount it again over fresh data.
   */
  const [chartEpoch, setChartEpoch] = React.useState(0);

  /** Write a change straight into the cached snapshot. */
  const patchData = React.useCallback(
    (fn: (data: TimelinerData) => TimelinerData) => {
      qc.setQueryData<TimelinerQueryResult>(TIMELINER_KEY, (old) =>
        !old || old.error !== null ? old : { ...old, data: fn(old.data) },
      );
    },
    [qc],
  );

  /**
   * Save what the chart reports, and keep everything else in step.
   *
   * On success the cached snapshot is patched rather than refetched: the chart
   * already shows the new state, and MASTER, the Excel export and the next tab
   * switch all read that same cache — without this they would happily show the
   * plan as it was before the drag.
   *
   * On failure the chart is the one holding the wrong story, so the stored plan
   * is pulled back in and the chart is rebuilt on top of it.
   */
  const persist = React.useCallback(
    async <T,>(
      run: () => Promise<ActionResult<T>>,
      onOk?: (data: T) => void,
    ) => {
      const res = await run();
      if (res.ok) {
        onOk?.(res.data);
        return;
      }
      showToast({ title: res.message });
      await qc.invalidateQueries({ queryKey: TIMELINER_KEY });
      setChartEpoch((n) => n + 1);
    },
    [qc],
  );

  const ganttHandlers: SvarGanttHandlers = React.useMemo(
    () => ({
      onDates: (changes) => {
        if (!selected || changes.length === 0) return;
        // One write for the whole chain: the bar that moved and everything its
        // dependencies pulled along with it.
        void persist(
          () =>
            rescheduleTimelineItemsAction({
              timeline_id: selected.id,
              items: changes,
            }),
          () => {
            const byId = new Map(changes.map((c) => [c.id, c]));
            patchData((d) => ({
              ...d,
              items: d.items.map((it) => {
                const c = byId.get(it.id);
                return c
                  ? { ...it, start_date: c.start_date, end_date: c.end_date }
                  : it;
              }),
            }));
          },
        );
      },
      onAddLink: (link) => {
        if (!selected) return;
        void persist(
          () =>
            createTimelineDependencyAction({ timeline_id: selected.id, ...link }),
          (dep) =>
            patchData((d) => ({
              ...d,
              dependencies: [
                ...d.dependencies.filter((x) => x.id !== dep.id),
                dep,
              ],
            })),
        );
      },
      onUpdateLink: (id, patch) => {
        void persist(
          () => updateTimelineDependencyAction({ id, ...patch }),
          (dep) =>
            patchData((d) => ({
              ...d,
              dependencies: d.dependencies.map((x) => (x.id === dep.id ? dep : x)),
            })),
        );
      },
      onDeleteLink: (id) => {
        void persist(
          () => deleteTimelineDependencyAction(id),
          () =>
            patchData((d) => ({
              ...d,
              dependencies: d.dependencies.filter((x) => x.id !== id),
            })),
        );
      },
      onDeleteItem: (id) => {
        void persist(
          () => deleteTimelineItemAction(id),
          () =>
            patchData((d) => ({
              ...d,
              items: d.items.filter((x) => x.id !== id),
              // The row is gone, so any link that hung off it is gone too.
              dependencies: d.dependencies.filter(
                (x) => x.from_item_id !== id && x.to_item_id !== id,
              ),
            })),
        );
      },
      onReorder: (rows) => {
        if (!selected) return;
        void persist(
          () =>
            reorderTimelineItemsAction({
              timeline_id: selected.id,
              items: rows,
            }),
          () => {
            const byId = new Map(rows.map((r) => [r.id, r]));
            patchData((d) => ({
              ...d,
              items: d.items.map((it) => {
                const r = byId.get(it.id);
                return r
                  ? { ...it, position: r.position, group_id: r.group_id }
                  : it;
              }),
            }));
          },
        );
      },
      onEditItem: (item) => openEditor(item),
    }),
    [selected, persist, patchData],
  );

  // Item editor (create / edit), remounted per open so fields reset.
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorItem, setEditorItem] = React.useState<TimelineItem | null>(null);
  const [editorKind, setEditorKind] = React.useState<TimelineItemKind>("task");
  const [editorKey, setEditorKey] = React.useState(0);

  function openEditor(item: TimelineItem | null, kind: TimelineItemKind = "task") {
    setEditorItem(item);
    setEditorKind(item?.kind ?? kind);
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
  }

  const settingsMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      weekends_enabled?: boolean;
      holiday_countries?: string[];
    }) => {
      const res = await updateTimelineSettingsAction(vars);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMELINER_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const deleteTimelineMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteTimelineAction(id);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: (data) => {
      if (selectedId === data.id) setSelectedId(null);
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function exportExcel() {
    if (!selected) return;
    exportTimelineXlsx({
      timeline: selected,
      items,
      dependencies,
      holidays,
    }).catch(
      (err: unknown) =>
        showToast({
          title: err instanceof Error ? err.message : "No se pudo exportar",
        }),
    );
  }

  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <section className="mx-auto flex w-full max-w-[120rem] flex-col gap-4 px-4 py-4 md:px-6 md:py-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
            <CalendarRange className="size-5" />
            Timeliner
          </h1>
          <p className="text-muted-foreground text-xs">
            Armá el cronograma del proyecto: tareas con duración, hitos y
            owners. Arrastrá las barras para mover o estirar, tirá un conector
            desde la punta de una barra hasta otra tarea para encadenarlas, y
            usá la manija ⋮⋮ de la izquierda para reordenar las filas. Un
            timeline nuevo ya viene con el proyecto base cargado. Visible y
            editable por el equipo, y compartible con el cliente en sólo
            lectura desde “Compartir”.
          </p>
        </div>
        {selected ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openEditor(null, "task")}
            >
              <ListTodo />
              Tarea
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openEditor(null, "milestone")}
            >
              <Flag />
              Hito
            </Button>
            <NewGroupPopover timelineId={selected.id} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={exportExcel}
              disabled={items.length === 0}
              title="Descargar Excel"
            >
              <Download />
              Excel
            </Button>
            <ShareTimelineButton timeline={selected} />
          </div>
        ) : null}
      </header>

      {/* Timeline tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          Timeline
        </span>
        <button
          type="button"
          onClick={() => setSelectedId(MASTER_TAB)}
          title="Planning de todos los timelines"
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold tracking-wide transition-colors",
            masterMode
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:bg-accent",
          )}
        >
          <LayoutGrid className="size-3" />
          MASTER
        </button>
        {timelines.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedId(t.id)}
            className={cn(
              "inline-flex h-7 max-w-[16rem] items-center truncate rounded-full border px-3 text-xs font-medium transition-colors",
              selected?.id === t.id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:bg-accent",
            )}
          >
            <span className="truncate">{t.name}</span>
            {t.share_token ? (
              <Link2
                className="ml-1.5 size-3 shrink-0 opacity-70"
                aria-label="Compartido con el cliente"
              />
            ) : null}
          </button>
        ))}
        <NewTimelinePopover onCreated={(id) => setSelectedId(id)} />
        {selected ? (
          <>
            <RenameTimelinePopover id={selected.id} name={selected.name} />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive size-7"
              aria-label="Eliminar timeline"
              onClick={() => {
                if (
                  confirm(
                    `¿Eliminar el timeline "${selected.name}" y todos sus elementos?`,
                  )
                )
                  deleteTimelineMutation.mutate(selected.id);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </>
        ) : null}
      </div>

      {/* Settings: weekends + holiday countries */}
      {selected ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={selected.weekends_enabled}
              onCheckedChange={(v) =>
                settingsMutation.mutate({
                  id: selected.id,
                  weekends_enabled: v,
                })
              }
            />
            Fines de semana
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Feriados
            </span>
            {HOLIDAY_COUNTRIES.map((c) => {
              const on = selected.holiday_countries.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    const next = on
                      ? selected.holiday_countries.filter((x) => x !== c.code)
                      : [...selected.holiday_countries, c.code];
                    settingsMutation.mutate({
                      id: selected.id,
                      holiday_countries: next,
                    });
                  }}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                    on ? c.chip : "bg-background hover:bg-accent",
                  )}
                  aria-pressed={on}
                >
                  <span className={cn("size-2 rounded-full", c.dot)} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {query.data?.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          Iniciá sesión para usar Timeliner.
        </p>
      ) : null}
      {query.data?.error && !query.data.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          {query.data.error}
        </p>
      ) : null}

      {query.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : masterMode ? (
        <MasterView
          timelines={timelines}
          items={allItems}
          holidays={holidays}
          onOpenTimeline={(id) => setSelectedId(id)}
        />
      ) : !selected ? (
        <EmptyTimelines onCreated={(id) => setSelectedId(id)} />
      ) : (
        <>
          <SvarGantt
            key={`${selected.id}:${chartEpoch}`}
            timeline={selected}
            groups={groups}
            items={items}
            dependencies={dependencies}
            holidays={holidays}
            handlers={ganttHandlers}
          />
          <button
            type="button"
            onClick={() => quickAddMutation.mutate()}
            disabled={quickAddMutation.isPending}
            className="text-muted-foreground hover:text-foreground hover:bg-accent/50 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-sm transition-colors"
          >
            <Plus className="size-4" />
            Agregar tarea rápida
          </button>
        </>
      )}

      {selected ? (
        <ItemEditor
          key={editorKey}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          timelineId={selected.id}
          groups={groups}
          item={editorItem}
          defaultStart={today}
          defaultKind={editorKind}
        />
      ) : null}
    </section>
  );
}

function NewTimelinePopover({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  // On by default: a new timeline arrives as a whole project you reshape,
  // which beats building the same twenty tasks by hand every time.
  const [useTemplate, setUseTemplate] = React.useState(true);
  const [anchor, setAnchor] = React.useState(() => defaultTemplateAnchor());

  const createMutation = useMutation({
    mutationFn: async (n: string) => {
      const res = await createTimelineAction({
        name: n,
        use_template: useTemplate,
        anchor_date: anchor,
      });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: (data) => {
      setName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
      onCreated(data.id);
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
          size="icon"
          variant="outline"
          className="size-7 rounded-full"
          aria-label="Nuevo timeline"
        >
          <Plus className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="text-xs font-medium">Nuevo timeline</div>
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
            placeholder="Ej: Lanzamiento Q3"
            className="h-9"
          />
          <Button
            type="button"
            size="icon"
            onClick={add}
            disabled={!name.trim() || createMutation.isPending}
            aria-label="Crear"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
          <span>
            Con el proyecto base
            <span className="text-muted-foreground block text-[11px]">
              {TEMPLATE_ITEMS.length} tareas e hitos ya encadenados
            </span>
          </span>
          <Switch checked={useTemplate} onCheckedChange={setUseTemplate} />
        </label>

        {useTemplate ? (
          <div className="space-y-1">
            <label className="text-muted-foreground text-[11px] font-medium">
              Arranca el
            </label>
            <Input
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value || anchor)}
              className="h-8"
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function NewGroupPopover({ timelineId }: { timelineId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");

  const createMutation = useMutation({
    mutationFn: async (n: string) => {
      const res = await createTimelineGroupAction({ timeline_id: timelineId, name: n });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setName("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
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
        <Button type="button" size="sm" variant="outline">
          <Layers />
          Grupo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <div className="text-xs font-medium">Nuevo grupo</div>
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
            placeholder="Ej: Pre-producción"
            className="h-9"
          />
          <Button
            type="button"
            size="icon"
            onClick={add}
            disabled={!name.trim() || createMutation.isPending}
            aria-label="Crear grupo"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RenameTimelinePopover({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(name);

  const renameMutation = useMutation({
    mutationFn: async (n: string) => {
      const res = await renameTimelineAction({ id, name: n });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: TIMELINER_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function handleOpen(next: boolean) {
    if (next) setDraft(name);
    setOpen(next);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) renameMutation.mutate(trimmed);
    else setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-muted-foreground size-7"
          aria-label="Renombrar timeline"
        >
          <Pencil className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2">
        <div className="text-xs font-medium">Renombrar timeline</div>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          className="h-9"
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={save}>
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmptyTimelines({ onCreated }: { onCreated: (id: string) => void }) {
  return (
    <div className="bg-muted/20 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
      <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <CalendarRange className="size-6" />
      </div>
      <div>
        <p className="text-sm font-medium">Todavía no hay timelines</p>
        <p className="text-muted-foreground text-xs">
          Creá el primero para empezar a planear el cronograma.
        </p>
      </div>
      <NewTimelinePopover onCreated={onCreated} />
    </div>
  );
}
