"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Palette } from "lucide-react";

import { updateMelyMetaAction } from "@/app/actions/mely";
import { MelyAvatar } from "@/components/mely/mely-avatar";
import { MELY_ITEMS_KEY } from "@/components/mely/use-mely-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import {
  MELY_COLORS,
  MELY_COLOR_CLASS,
  type MelyColor,
} from "@/lib/mely/types";
import { cn } from "@/lib/utils";

export function MelyMetaEditor({
  project,
  color,
  emoji,
  trigger,
}: {
  project: string;
  color: MelyColor;
  emoji: string | null;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [emojiDraft, setEmojiDraft] = React.useState(emoji ?? "");

  function handleOpen(next: boolean) {
    if (next) setEmojiDraft(emoji ?? "");
    setOpen(next);
  }

  const mutation = useMutation({
    mutationFn: async (patch: {
      color?: MelyColor;
      emoji?: string | null;
    }) => {
      const result = await updateMelyMetaAction({
        project,
        ...patch,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MELY_ITEMS_KEY }),
    onError: (err: Error) => showToast({ title: err.message }),
  });

  function saveEmoji() {
    const next = emojiDraft.trim().slice(0, 4) || null;
    if (next !== (emoji ?? null)) mutation.mutate({ emoji: next });
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Color y emoji"
          >
            <Palette className="size-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4">
        <div className="flex items-center gap-3">
          <MelyAvatar
            project={project}
            color={color}
            emoji={emojiDraft || emoji}
            size="lg"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{project}</div>
            <div className="text-muted-foreground text-[11px]">
              Personalizá color y emoji.
            </div>
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-1.5 text-[11px] font-medium uppercase tracking-wider">
            Color
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {MELY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => mutation.mutate({ color: c })}
                className={cn(
                  "ring-offset-background focus-visible:ring-ring relative flex h-7 items-center justify-center rounded-md border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  MELY_COLOR_CLASS[c].chip,
                  color === c && "ring-2 ring-offset-1",
                  color === c && MELY_COLOR_CLASS[c].ring,
                )}
                aria-label={c}
              >
                {color === c ? <Check className="size-3.5" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-muted-foreground mb-1.5 text-[11px] font-medium uppercase tracking-wider">
            Emoji (opcional)
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={emojiDraft}
              onChange={(e) => setEmojiDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveEmoji();
                }
              }}
              placeholder="🚀  📊  💎"
              maxLength={4}
            />
            <Button type="button" size="sm" onClick={saveEmoji}>
              Guardar
            </Button>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Si no hay emoji, se muestran las dos primeras letras del nombre.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
