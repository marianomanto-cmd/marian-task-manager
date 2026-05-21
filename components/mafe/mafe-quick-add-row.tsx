"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { createMafeItemAction } from "@/app/actions/mafe";
import { MAFE_ITEMS_KEY } from "@/components/mafe/use-mafe-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  MAFE_ITEM_CATEGORIES,
  MAFE_ITEM_CATEGORY_LABEL,
  type MafeItemCategory,
} from "@/lib/mafe/types";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "h-8 rounded-md border bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:ring-[3px]",
);

export function MafeQuickAddRow({
  project,
  defaultCategory = "otros",
}: {
  project: string;
  defaultCategory?: MafeItemCategory;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] =
    React.useState<MafeItemCategory>(defaultCategory);

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createMafeItemAction({
        project,
        title: title.trim(),
        category,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: MAFE_ITEMS_KEY });
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
        onChange={(e) => setCategory(e.target.value as MafeItemCategory)}
        className={selectClass}
        aria-label="Categoría"
      >
        {MAFE_ITEM_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {MAFE_ITEM_CATEGORY_LABEL[c]}
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
