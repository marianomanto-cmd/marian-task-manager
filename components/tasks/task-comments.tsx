"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { formatDistanceToNow, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Trash } from "lucide-react";

import {
  createCommentAction,
  deleteCommentAction,
  listCommentsAction,
  type TaskComment,
} from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import { displayNameForEmail } from "@/lib/team/members";

const COMMENTS_KEY = (taskId: string) =>
  ["task-comments", taskId] as const;
const ACTIVITY_KEY = ["activity"] as const;

export function TaskComments({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");

  const commentsQuery = useQuery({
    queryKey: COMMENTS_KEY(taskId),
    staleTime: 15_000,
    queryFn: async () => {
      const result = await listCommentsAction(taskId);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: string) => {
      const result = await createCommentAction({ task_id: taskId, body });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: COMMENTS_KEY(taskId) });
      queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY });
    },
    onError: (err: Error) => {
      showToast({ title: "Comentario falló", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCommentAction(id);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMMENTS_KEY(taskId) });
    },
    onError: (err: Error) => {
      showToast({ title: "No se pudo borrar", description: err.message });
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) return;
    createMutation.mutate(body);
  }

  const comments = commentsQuery.data ?? [];
  const submitting = createMutation.isPending;

  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">
        Comentarios
      </h3>

      {commentsQuery.isLoading ? (
        <p className="text-muted-foreground text-xs">Cargando…</p>
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-xs">Sin comentarios todavía.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canDelete={c.author_user_id === currentUserId}
              onDelete={() => deleteMutation.mutate(c.id)}
              deleting={
                deleteMutation.isPending &&
                deleteMutation.variables === c.id
              }
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Sumá un comentario…"
          rows={2}
          disabled={submitting}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={submitting || draft.trim().length === 0}
          >
            {submitting ? "Enviando…" : "Comentar"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
  deleting,
}: {
  comment: TaskComment;
  canDelete: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const author = displayNameForEmail(comment.author_email);
  const relative = formatDistanceToNow(parseISO(comment.created_at), {
    addSuffix: true,
    locale: es,
  });

  return (
    <li className="bg-muted/30 rounded-md border p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{author}</span>
        <span className="text-muted-foreground text-[10px]">{relative}</span>
      </div>
      <p className="mt-1 text-sm whitespace-pre-wrap leading-snug">
        {comment.body}
      </p>
      {canDelete ? (
        <div className="mt-1 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
            className="text-muted-foreground hover:text-destructive h-6 px-1.5 text-[11px]"
          >
            <Trash className="size-3" />
            {deleting ? "Borrando…" : "Borrar"}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
