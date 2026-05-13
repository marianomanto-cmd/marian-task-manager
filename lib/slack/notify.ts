/**
 * Best-effort Slack notifier. For each task event we DM every assignee
 * (except the actor) individually via `chat.postMessage` using the bot
 * token in `SLACK_BOT_TOKEN`.
 *
 * Never throws — a failed notification must not abort the parent action.
 * If the bot token is missing the function is a no-op so local dev stays
 * quiet. Assignees without a configured `slackUserId` are silently
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

export type TaskEvent =
  | {
      kind: "created";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      actorEmail: string | null;
    }
  | {
      kind: "status_changed";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      from: TaskStatus;
      to: TaskStatus;
      actorEmail: string | null;
    }
  | {
      kind: "commented";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      preview: string;
      actorEmail: string | null;
    }
  | {
      kind: "updated";
      taskId: string;
      title: string;
      assigneeKeys: string[];
      fields: string[];
      actorEmail: string | null;
    }
  | {
      kind: "assigned";
      taskId: string;
      title: string;
      newAssigneeKey: string;
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
 * Build the message text for a given recipient. We pass the recipient
 * because some events read more naturally in second person ("te asignó")
 * once we know we're talking to that specific user.
 */
function buildText(event: TaskEvent): string {
  const actor = displayNameForEmail(event.actorEmail);
  const url = taskUrl(event.taskId);
  const titleLink = url ? `<${url}|${event.title}>` : `*${event.title}*`;

  switch (event.kind) {
    case "created":
      return `📌 ${actor} creó la tarea ${titleLink} y te asignó.`;
    case "assigned":
      return `📌 ${actor} te asignó a la tarea ${titleLink}.`;
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

async function postDM(userId: string, text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: userId,
        text,
        mrkdwn: true,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      console.error("[slack] DM failed", { userId, error: json.error });
    }
  } catch (err) {
    console.error("[slack] DM error", err);
  }
}

/**
 * Resolve which member keys should receive a DM for this event. We
 * always exclude the actor (no self-pings).
 */
function recipientsFor(event: TaskEvent): string[] {
  const actorKey = getMemberByEmail(event.actorEmail)?.key ?? null;
  if (event.kind === "assigned") {
    return event.newAssigneeKey === actorKey ? [] : [event.newAssigneeKey];
  }
  return event.assigneeKeys.filter((k) => k !== actorKey);
}

export async function notifyTaskEvent(event: TaskEvent): Promise<void> {
  if (!process.env.SLACK_BOT_TOKEN) return;
  const recipients = recipientsFor(event);
  if (recipients.length === 0) return;
  const text = buildText(event);

  // Fire DMs concurrently. Each postDM swallows its own errors, so a
  // single failure doesn't block the others.
  await Promise.all(
    recipients.map((key) => {
      const member = getMemberByKey(key);
      if (!member?.slackUserId) return Promise.resolve();
      return postDM(member.slackUserId, text);
    }),
  );
}
