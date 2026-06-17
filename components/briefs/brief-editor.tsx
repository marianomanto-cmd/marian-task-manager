"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateBriefAction } from "@/app/actions/briefs";
import { BRIEFS_KEY } from "@/components/briefs/use-briefs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import {
  BRIEF_COLUMNS,
  type Brief,
  type BriefFields,
  emptyBriefFields,
} from "@/lib/briefs/types";

function fieldsFromBrief(brief: Brief): BriefFields {
  const fields = emptyBriefFields();
  for (const key of Object.keys(fields) as (keyof BriefFields)[]) {
    fields[key] = brief[key] ?? "";
  }
  return fields;
}

export function BriefEditor({
  brief,
  open,
  onOpenChange,
}: {
  brief: Brief | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  // Initialized from the brief at mount; the board remounts this via `key` each
  // time a row is opened, so the form always starts from fresh data.
  const [draft, setDraft] = React.useState<BriefFields>(() =>
    brief ? fieldsFromBrief(brief) : emptyBriefFields(),
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!brief) throw new Error("Sin brief");
      const res = await updateBriefAction({ id: brief.id, patch: draft });
      if (!res.ok) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRIEFS_KEY });
      onOpenChange(false);
      showToast({ title: "Brief actualizado" });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Editar brief"
      description="Ajustá lo que Claude haya leído distinto antes de pasarlo al equipo de medios."
      contentClassName="sm:max-w-2xl"
    >
      <div className="max-h-[65vh] space-y-3 overflow-y-auto px-1 pb-1">
        {BRIEF_COLUMNS.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <Label htmlFor={`brief-${c.key}`}>{c.label}</Label>
            {c.long ? (
              <Textarea
                id={`brief-${c.key}`}
                value={draft[c.key]}
                rows={3}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [c.key]: e.target.value }))
                }
              />
            ) : (
              <Input
                id={`brief-${c.key}`}
                value={draft[c.key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [c.key]: e.target.value }))
                }
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
