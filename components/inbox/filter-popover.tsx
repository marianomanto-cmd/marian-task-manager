"use client";

import * as React from "react";
import { Filter, Save, X } from "lucide-react";

import { useCreateSavedFilter } from "@/components/inbox/use-saved-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import type { EmailAiCategory } from "@/lib/gmail/types";
import type { InboxFilter } from "@/lib/inbox/filter";
import { cn } from "@/lib/utils";

const CATEGORIES: { value: EmailAiCategory; label: string }[] = [
  { value: "URGENTE", label: "Urgente" },
  { value: "CLIENTE", label: "Cliente" },
  { value: "PROVEEDOR", label: "Proveedor" },
  { value: "INTERNO", label: "Interno" },
  { value: "INFORMATIVO", label: "Informativo" },
  { value: "OTROS", label: "Otros" },
];

function activeCount(filter: InboxFilter): number {
  let n = 0;
  if (filter.categories && filter.categories.length > 0) n += 1;
  if (filter.campaignCode && filter.campaignCode.trim().length > 0) n += 1;
  return n;
}

export function FilterPopover({
  filter,
  onChange,
}: {
  filter: InboxFilter;
  onChange: (next: InboxFilter) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const createMutation = useCreateSavedFilter();

  const categories = filter.categories ?? [];
  const campaignCode = filter.campaignCode ?? "";
  const count = activeCount(filter);

  function toggleCategory(cat: EmailAiCategory) {
    const has = categories.includes(cat);
    const next = has ? categories.filter((c) => c !== cat) : [...categories, cat];
    onChange({ ...filter, categories: next.length > 0 ? next : undefined });
  }

  function setCampaign(value: string) {
    onChange({
      ...filter,
      campaignCode: value.length > 0 ? value : undefined,
    });
  }

  function clearAll() {
    onChange({ ...filter, categories: undefined, campaignCode: undefined });
  }

  async function saveAs() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      showToast({ title: "Falta el nombre" });
      return;
    }
    try {
      await createMutation.mutateAsync({ name: trimmed, criteria: filter });
      showToast({ title: `Filtro "${trimmed}" guardado` });
      setName("");
      setOpen(false);
    } catch (err) {
      showToast({
        title: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={count > 0 ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
        >
          <Filter className="size-3.5" />
          <span>Filtros</span>
          {count > 0 ? (
            <span className="bg-background/20 text-[10px] font-semibold rounded px-1 py-0.5">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Categoría
            </p>
            {count > 0 ? (
              <button
                type="button"
                onClick={clearAll}
                className="text-muted-foreground hover:text-foreground text-[11px] underline-offset-2 hover:underline"
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const active = categories.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggleCategory(c.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Código de campaña
          </p>
          <div className="relative">
            <Input
              value={campaignCode}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Ej. CL-ACME-2025"
              className="pr-7"
            />
            {campaignCode.length > 0 ? (
              <button
                type="button"
                onClick={() => setCampaign("")}
                aria-label="Limpiar campaña"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Guardar combinación actual
          </p>
          <div className="flex gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cliente X sin leer"
              disabled={count === 0}
            />
            <Button
              type="button"
              size="sm"
              onClick={saveAs}
              disabled={
                count === 0 ||
                name.trim().length === 0 ||
                createMutation.isPending
              }
            >
              <Save className="size-3.5" />
              Guardar
            </Button>
          </div>
          {count === 0 ? (
            <p className="text-muted-foreground text-[11px]">
              Elegí al menos una categoría o ingresá una campaña.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
