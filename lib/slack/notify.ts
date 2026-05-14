/**
 * Best-effort Slack notifier. For each task event we DM every recipient
 * (except the actor) individually via `chat.postMessage` using the bot
 * token in `SLACK_BOT_TOKEN`.
 *
 * Recipients come in two roles: "assignee" (owns the task) and "notified"
 * (kept in the loop). Both get the same broadcast events; only the wording
 * differs where it reads better in second person.
 *
 * Never throws — a failed notification must not abort the parent action.
 * If the bot token is missing the function is a no-op so local dev stays
 * quiet. Recipients without a configured `slackUserId` are silently
 * skipped (we can't DM someone we can't address).
 */

import {
  TASK_STATUS_LABEL,
  type TaskStatus,
} from "@/lib/tasks/types";
import {
  displayNameForEmail,
  getMemberByEmail,
  getMemberByKey,
} from "@/lib/team/members";

type Role = "assignee" | "notified";

export type TaskEvent =
  | {
      kind: "created";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      notifiedKeys: string[];
      actorEmail: string | null;
    }
  | {
      kind: "status_changed";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      notifiedKeys: string[];
      from: TaskStatus;
      to: TaskStatus;
      actorEmail: string | null;
    }
  | {
      kind: "commented";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      notifiedKeys: string[];
      preview: string;
      actorEmail: string | null;
    }
  | {
      kind: "updated";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      notifiedKeys: string[];
      fields: string[];
      actorEmail: string | null;
    }
  | {
      kind: "assigned";
      taskId: string;
      title: string;
      newAssigneeKey: string;
      actorEmail: string | null;
    }
  | {
      kind: "notified";
      taskId: string;
      title: string;
      newNotifiedKey: string;
      actorEmail: string | null;
    };

function fieldLabel(field: string): string {
  switch (field) {
    case "title":
      return "el título";
    case "notes":
      return "las notas";
    case "priority":
      return "la prioridad";
    case "due_date":
      return "la fecha de vencimiento";
    case "link":
      return "el link";
    default:
      return field;
  }
}

function taskUrl(taskId: string): string | null {
  const base = process.env.APP_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/tasks?task=${encodeURIComponent(taskId)}`;
}

/**
 * Build the message text for a given recipient. The role only changes the
 * wording of events that read in second person ("te asignó" vs "te puso
 * como notificado"); the rest are role-neutral.
 */
function buildText(event: TaskEvent, role: Role): string {
  const actor = displayNameForEmail(event.actorEmail);
  const url = taskUrl(event.taskId);
  const titleLink = url ? `<${url}|${event.title}>` : `*${event.title}*`;

  switch (event.kind) {
    case "created":
      return role === "assignee"
        ? `📌 ${actor} creó la tarea ${titleLink} y te asignó.`
        : `📋 ${actor} creó la tarea ${titleLink} y te puso como notificado.`;
    case "assigned":
      return `📌 ${actor} te asignó a la tarea ${titleLink}.`;
    case "notified":
      return `📋 ${actor} te agregó como notificado en la tarea ${titleLink}.`;
    case "status_changed":
      return `🔄 ${actor} movió ${titleLink} a *${TASK_STATUS_LABEL[event.to]}*.`;
    case "commented": {
      const quote = event.preview
        .split("\n")
        .slice(0, 4)
        .map((line) => `> ${line}`)
        .join("\n");
      return `💬 ${actor} comentó en ${titleLink}:\n${quote}`;
    }
    case "updated": {
      const labels = event.fields.map(fieldLabel).join(", ");
      return `✏️ ${actor} actualizó ${labels} en ${titleLink}.`;
    }
  }
}

async function slackCall<T extends { ok: boolean; error?: string }>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

async function postDM(userId: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    // Two-step: open (or reuse) the IM channel, then post. This is the
    // pattern Slack documents as most reliable for bot DMs.
    const open = await slackCall<{
      ok: boolean;
      error?: string;
      needed?: string;
      provided?: string;
      channel?: { id: string };
    }>(token, "conversations.open", { users: userId });
    if (!open.ok || !open.channel?.id) {
      console.error("[slack] conversations.open failed", {
        userId,
        error: open.error,
        needed: open.needed,
        provided: open.provided,
      });
      return;
    }

    const post = await slackCall<{
      ok: boolean;
      error?: string;
      needed?: string;
      provided?: string;
    }>(token, "chat.postMessage", {
      channel: open.channel.id,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!post.ok) {
      console.error("[slack] chat.postMessage failed", {
        userId,
        channel: open.channel.id,
        error: post.error,
        needed: post.needed,
        provided: post.provided,
      });
    }
  } catch (err) {
    console.error("[slack] DM error", err);
  }
}

/**
 * Resolve which members should receive a DM for this event, tagged with
 * their role. The actor is always excluded (no self-pings), and someone
 * who is both assignee and notified is DM'd once as an assignee.
 */
function recipientsFor(event: TaskEvent): { key: string; role: Role }[] {
  const actorKey = getMemberByEmail(event.actorEmail)?.key ?? null;
  if (event.kind === "assigned") {
    return event.newAssigneeKey === actorKey
      ? []
      : [{ key: event.newAssigneeKey, role: "assignee" }];
  }
  if (event.kind === "notified") {
    return event.newNotifiedKey === actorKey
      ? []
      : [{ key: event.newNotifiedKey, role: "notified" }];
  }
  const seen = new Set<string>();
  const out: { key: string; role: Role }[] = [];
  for (const key of event.assigneeKeys) {
    if (key === actorKey || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, role: "assignee" });
  }
  for (const key of event.notifiedKeys) {
    if (key === actorKey || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, role: "notified" });
  }
  return out;
}

export async function notifyTaskEvent(event: TaskEvent): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) return;
  const recipients = recipientsFor(event);
  if (recipients.length === 0) return;

  // Fire DMs concurrently. Each postDM swallows its own errors, so a
  // single failure doesn't block the others.
  await Promise.all(
    recipients.map(({ key, role }) => {
      const member = getMemberByKey(key);
      if (!member?.slackUserId) return Promise.resolve();
      return postDM(member.slackUserId, buildText(event, role));
    }),
  );
}
