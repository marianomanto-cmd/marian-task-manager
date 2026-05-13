/**
 * Best-effort Slack notifier. Posts a single message per task event to
 * the channel configured via `SLACK_WEBHOOK_URL` (Slack Incoming Webhook).
 *
 * Never throws — a failed notification must not abort the parent action.
 * If the webhook env var is missing the function is a no-op so local dev
 * stays quiet.
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

function actorName(email: string | null): string {
  return displayNameForEmail(email);
}

/**
 * Format recipients excluding the actor (you don't want to ping yourself
 * for your own action). Returns Slack mention syntax `<@U123>` for members
 * with a configured slackUserId, falling back to *Name* bold.
 */
function mentionsFor(
  assigneeKeys: string[],
  actorEmail: string | null,
): string {
  const actorMember = getMemberByEmail(actorEmail);
  const filtered = assigneeKeys.filter((k) => k !== actorMember?.key);
  if (filtered.length === 0) return "";
  const parts = filtered.map((key) => {
    const m = getMemberByKey(key);
    if (m?.slackUserId) return `<@${m.slackUserId}>`;
    return m ? `*${m.name}*` : `*${key}*`;
  });
  return parts.join(" ");
}

function taskUrl(taskId: string): string | null {
  const base = process.env.APP_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/tasks?task=${encodeURIComponent(taskId)}`;
}

function buildText(event: TaskEvent): string | null {
  const actor = actorName(event.actorEmail);
  const url = taskUrl(event.taskId);
  const titleLink = url ? `<${url}|${event.title}>` : `*${event.title}*`;

  switch (event.kind) {
    case "created": {
      const ms = mentionsFor(event.assigneeKeys, event.actorEmail);
      if (!ms) return null;
      return `📌 ${actor} creó la tarea ${titleLink} y te asignó. ${ms}`;
    }
    case "assigned": {
      const m = getMemberByKey(event.newAssigneeKey);
      const actorMember = getMemberByEmail(event.actorEmail);
      if (!m || m.key === actorMember?.key) return null;
      const mention = m.slackUserId ? `<@${m.slackUserId}>` : `*${m.name}*`;
      return `📌 ${actor} te asignó a la tarea ${titleLink}. ${mention}`;
    }
    case "status_changed": {
      const ms = mentionsFor(event.assigneeKeys, event.actorEmail);
      if (!ms) return null;
      return `🔄 ${actor} movió ${titleLink} a *${TASK_STATUS_LABEL[event.to]}*. ${ms}`;
    }
    case "commented": {
      const ms = mentionsFor(event.assigneeKeys, event.actorEmail);
      if (!ms) return null;
      const quote = event.preview
        .split("\n")
        .slice(0, 4)
        .map((line) => `> ${line}`)
        .join("\n");
      return `💬 ${actor} comentó en ${titleLink}:\n${quote}\n${ms}`;
    }
    case "updated": {
      const ms = mentionsFor(event.assigneeKeys, event.actorEmail);
      if (!ms || event.fields.length === 0) return null;
      const labels = event.fields.map(fieldLabel).join(", ");
      return `✏️ ${actor} actualizó ${labels} en ${titleLink}. ${ms}`;
    }
  }
}

export async function notifyTaskEvent(event: TaskEvent): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  const text = buildText(event);
  if (!text) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, mrkdwn: true }),
    });
  } catch (err) {
    console.error("[slack] notify failed", err);
  }
}
