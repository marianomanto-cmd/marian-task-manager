"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Copy,
  Download,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { deleteBriefAction } from "@/app/actions/briefs";
import { BriefEditor } from "@/components/briefs/brief-editor";
import { BRIEFS_KEY, useBriefs } from "@/components/briefs/use-briefs";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import {
  copyBriefsToClipboard,
  downloadBriefsXlsx,
} from "@/lib/briefs/export";
import { BRIEF_COLUMNS, type Brief } from "@/lib/briefs/types";
import { cn } from "@/lib/utils";

type UploadItem = {
  id: string;
  name: string;
  status: "processing" | "error";
  error?: string;
};

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function BriefsBoard() {
  const query = useBriefs();
  const qc = useQueryClient();

  const briefs = React.useMemo(() => query.data?.data ?? [], [query.data?.data]);

  const [queue, setQueue] = React.useState<UploadItem[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [editing, setEditing] = React.useState<Brief | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorKey, setEditorKey] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteBriefAction(id);
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BRIEFS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const uploadOne = React.useCallback(
    async (file: File) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setQueue((q) => [...q, { id, name: file.name, status: "processing" }]);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/briefs", { method: "POST", body: form });
        const json: { brief?: Brief; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "No se pudo procesar el brief.");
        await qc.invalidateQueries({ queryKey: BRIEFS_KEY });
        setQueue((q) => q.filter((item) => item.id !== id));
      } catch (err) {
        setQueue((q) =>
          q.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  error: err instanceof Error ? err.message : "Error",
                }
              : item,
          ),
        );
      }
    },
    [qc],
  );

  const handleFiles = React.useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const pdfs = Array.from(files).filter(isPdf);
      if (pdfs.length === 0) {
        showToast({ title: "Subí archivos PDF." });
        return;
      }
      // Sequential: gentler on rate limits and gives row-by-row feedback.
      for (const file of pdfs) await uploadOne(file);
    },
    [uploadOne],
  );

  function openEditor(brief: Brief) {
    setEditing(brief);
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
  }

  async function handleCopy() {
    try {
      await copyBriefsToClipboard(briefs);
      showToast({
        title: "Tabla copiada",
        description: "Pegala en Google Sheets o Excel.",
      });
    } catch {
      showToast({ title: "No se pudo copiar la tabla." });
    }
  }

  function handleExcel() {
    downloadBriefsXlsx(briefs).catch(() =>
      showToast({ title: "No se pudo generar el Excel." }),
    );
  }

  const processing = queue.filter((q) => q.status === "processing").length;

  return (
    <section className="mx-auto flex w-full max-w-[120rem] flex-col gap-4 px-4 py-4 md:px-6 md:py-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight md:text-2xl">
            <FileText className="size-5" />
            Briefs
          </h1>
          <p className="text-muted-foreground text-xs">
            Subí los PDF de los briefs y Claude te arma la tabla lista para
            pasarle al equipo de medios. Tocá una fila para corregir cualquier
            dato.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={briefs.length === 0}
            title="Copiar la tabla (se pega en Sheets/Excel)"
          >
            <Copy />
            Copiar tabla
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExcel}
            disabled={briefs.length === 0}
            title="Descargar Excel"
          >
            <Download />
            Excel
          </Button>
        </div>
      </header>

      {/* Dropzone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-center transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "hover:bg-accent/40 hover:border-muted-foreground/40",
        )}
      >
        <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
          <Upload className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">
            Soltá los PDF acá o hacé clic para elegir
          </p>
          <p className="text-muted-foreground text-xs">
            Podés subir varios briefs a la vez · solo PDF
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </button>

      {/* Upload queue */}
      {queue.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {queue.map((item) => (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                item.status === "error"
                  ? "border-destructive/40 bg-destructive/5"
                  : "bg-muted/30",
              )}
            >
              {item.status === "processing" ? (
                <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
              ) : (
                <AlertCircle className="text-destructive size-4 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{item.name}</span>
                <span
                  className={cn(
                    "ml-2 text-xs",
                    item.status === "error"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {item.status === "processing"
                    ? "Procesando con Claude…"
                    : item.error}
                </span>
              </span>
              {item.status === "error" ? (
                <button
                  type="button"
                  onClick={() =>
                    setQueue((q) => q.filter((x) => x.id !== item.id))
                  }
                  className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
                  aria-label="Descartar"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {query.data?.authRequired ? (
        <p className="text-destructive text-sm" role="alert">
          Iniciá sesión para usar Briefs.
        </p>
      ) : query.data?.error ? (
        <p className="text-destructive text-sm" role="alert">
          {query.data.error}
        </p>
      ) : null}

      {/* Table / empty state */}
      {query.isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : briefs.length === 0 ? (
        processing === 0 ? (
          <div className="bg-muted/20 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-14 text-center">
            <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <Sparkles className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium">Todavía no cargaste briefs</p>
              <p className="text-muted-foreground mx-auto max-w-md text-xs">
                Subí el primer PDF y Claude va a leerlo y completar start/end
                date, mercados, objetivo, inversión, KPI, metas, link, target,
                redes y un resumen del background.
              </p>
            </div>
          </div>
        ) : null
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                {BRIEF_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className="text-muted-foreground border-b px-3 py-2 align-bottom text-xs font-medium tracking-wide whitespace-nowrap uppercase"
                  >
                    {c.label}
                  </th>
                ))}
                <th className="border-b px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {briefs.map((brief) => (
                <tr
                  key={brief.id}
                  onClick={() => openEditor(brief)}
                  className="hover:bg-accent/40 group cursor-pointer border-b last:border-0"
                >
                  {BRIEF_COLUMNS.map((c) => (
                    <BriefCell key={c.key} brief={brief} columnKey={c.key} long={c.long} />
                  ))}
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      aria-label="Eliminar brief"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar el brief "${brief.campaign_name || brief.file_name || ""}"?`))
                          deleteMutation.mutate(brief.id);
                      }}
                      className="text-muted-foreground hover:text-destructive rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BriefEditor
        key={editorKey}
        brief={editing}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </section>
  );
}

function BriefCell({
  brief,
  columnKey,
  long,
}: {
  brief: Brief;
  columnKey: (typeof BRIEF_COLUMNS)[number]["key"];
  long?: boolean;
}) {
  const value = brief[columnKey] ?? "";
  const isLink = columnKey === "link" && /^https?:\/\//i.test(value);

  return (
    <td
      className={cn(
        "border-b-0 px-3 py-2 align-top",
        long ? "min-w-[16rem] max-w-[24rem]" : "min-w-[8rem] whitespace-pre-wrap",
        columnKey === "campaign_name" && "font-medium",
      )}
    >
      {value ? (
        isLink ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-primary break-all underline-offset-2 hover:underline"
          >
            {value}
          </a>
        ) : (
          <span
            className={cn("block", long && "line-clamp-3")}
            title={long ? value : undefined}
          >
            {value}
          </span>
        )
      ) : (
        <span className="text-muted-foreground/50">—</span>
      )}
      {columnKey === "campaign_name" && brief.file_name ? (
        <span className="text-muted-foreground mt-0.5 block truncate text-xs font-normal">
          {brief.file_name}
        </span>
      ) : null}
    </td>
  );
}
