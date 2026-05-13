"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";

import { backfillReadStateAction } from "@/app/actions/emails";
import { EMAILS_INVALIDATION_KEY } from "@/components/inbox/use-emails";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";

/**
 * One-shot button: re-fetches the current UNREAD label from Gmail for every
 * email in the user's DB and updates is_read. Useful right after migration
 * 0012 to bring pre-existing rows in line with Gmail's actual state.
 */
export function BackfillReadButton() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await backfillReadStateAction();
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: EMAILS_INVALIDATION_KEY });
      showToast({
        title: `${data.updated} estado${data.updated === 1 ? "" : "s"} actualizado${data.updated === 1 ? "" : "s"}`,
        description: `Revisé ${data.checked} mails contra Gmail.`,
      });
    },
    onError: (err: Error) => {
      showToast({
        title: "No se pudo sincronizar",
        description: err.message,
      });
    },
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title="Re-fetch UNREAD desde Gmail para mails ya sincronizados"
    >
      <RotateCw className={mutation.isPending ? "animate-spin" : undefined} />
      {mutation.isPending ? "Actualizando…" : "Sync estados Gmail"}
    </Button>
  );
}
