"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { createMelyItemAction } from "@/app/actions/mely";
import { MELY_ITEMS_KEY } from "@/components/mely/use-mely-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import {
  MELY_ITEM_CATEGORIES,
  MELY_ITEM_CATEGORY_LABEL,
  type MelyItemCategory,
} from "@/lib/mely/types";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50",
  "h-8 rounded-md border bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:ring-[3px]",
);

export function MelyQuickAddRow({
  project,
  defaultCategory = "otros",
}: {
  project: string;
  defaultCategory?: MelyItemCategory;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [category, setCategory] =
    React.useState<MelyItemCategory>(defaultCategory);

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await createMelyItemAction({
        project,
        title: title.trim(),
        category,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setTitle("");
      qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY });
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
        onChange={(e) => setCategory(e.target.value as MelyItemCategory)}
        className={selectClass}
        aria-label="Categoría"
      >
        {MELY_ITEM_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {MELY_ITEM_CATEGORY_LABEL[c]}
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
