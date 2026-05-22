"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { createNadineItemAction } from "@/app/actions/nadine";
import { NADINE_ITEMS_KEY } from "@/components/nadine/use-nadine-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  NADINE_ITEM_CATEGORIES,
  NADINE_ITEM_CATEGORY_LABEL,
  type NadineItemCategory,
} from "@/lib/nadine/types";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "h-8 rounded-md border bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:ring-[3px]",
);

export function NadineQuickAddRow({
  project,
  defaultCategory = "otros",
}: {
  project: string;
  defaultCategory?: NadineItemCategory;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] =
    React.useState<NadineItemCategory>(defaultCategory);

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createNadineItemAction({
        project,
        title: title.trim(),
        category,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: NADINE_ITEMS_KEY });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function submit() {
    if (!title.trim()) return;
    createMutation.mutate();
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <Plus className="text-muted-foreground size-3.5" />
      <Input
        placeholder="Nueva tarea…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="h-8 border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as NadineItemCategory)}
        className={selectClass}
        aria-label="Categoría"
      >
        {NADINE_ITEM_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {NADINE_ITEM_CATEGORY_LABEL[c]}
          </option>
        ))}
      </select>
      <Button
        type="button"
        size="sm"
        onClick={submit}
        disabled={!title.trim() || createMutation.isPending}
      >
        Agregar
      </Button>
    </div>
  );
}
