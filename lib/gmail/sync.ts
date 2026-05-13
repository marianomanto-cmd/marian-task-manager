import type { gmail_v1 } from "googleapis";

import { getGmailClient } from "@/lib/gmail/client";
import type { EmailAttachment } from "@/lib/gmail/types";

const ME = "me";
const BODY_PREVIEW_LIMIT = 1500;

export type ParsedMessage = {
  gmail_message_id: string;
  gmail_thread_id: string;
  sender_name: string | null;
  sender_email: string | null;
  subject: string | null;
  snippet: string | null;
  body_preview: string | null;
  received_at: string;
  has_attachments: boolean;
  attachments_meta: EmailAttachment[];
};

/**
 * First-time bootstrap: pull the most recent `maxResults` message ids,
 * skipping Gmail chats. Returns ids in reverse-chronological order (Gmail's
 * native order).
 */
export async function listInitialMessageIds(maxResults = 50): Promise<string[]> {
  const gmail = await getGmailClient();
  const { data } = await gmail.users.messages.list({
    userId: ME,
    maxResults,
    q: "-in:chats",
  });
  return (data.messages ?? [])
    .map((m) => m.id ?? "")
    .filter((id): id is string => id.length > 0);
}

export type HistoryDelta = {
  messageIds: string[];
  latestHistoryId: string | null;
};

/**
 * Incremental sync: returns message ids added since `startHistoryId` and
 * the new cursor to persist. Falls back to a fresh list when Gmail rejects
 * the cursor as too old (404 / errors mentioning historyId).
 */
export async function listMessageIdsFromHistory(
  startHistoryId: string,
): Promise<HistoryDelta | { reset: true; reason: string }> {
  const gmail = await getGmailClient();
  try {
    const { data } = await gmail.users.history.list({
      userId: ME,
      startHistoryId,
      historyTypes: ["messageAdded"],
    });

    const ids = new Set<string>();
    for (const entry of data.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        const id = added.message?.id;
        if (id) ids.add(id);
      }
    }
    return {
      messageIds: Array.from(ids),
      latestHistoryId: data.historyId ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Gmail invalidates historyId after ~7 days; we fall back to a fresh
    // pull rather than fail the sync outright.
    if (
      message.includes("historyId") ||
      message.includes("404") ||
      message.includes("Not Found")
    ) {
      return { reset: true, reason: message };
    }
    throw err;
  }
}

export async function getCurrentHistoryId(): Promise<string | null> {
  const gmail = await getGmailClient();
  const { data } = await gmail.users.getProfile({ userId: ME });
  return data.historyId ?? null;
}

/**
 * Fetches the metadata + a body preview for one message and normalizes the
 * Gmail payload into the shape we persist.
 */
export async function getMessage(
  messageId: string,
): Promise<ParsedMessage | null> {
  const gmail = await getGmailClient();
  const { data } = await gmail.users.messages.get({
    userId: ME,
    id: messageId,
    format: "full",
  });
  return parseMessage(data);
}

export function parseMessage(
  msg: gmail_v1.Schema$Message,
): ParsedMessage | null {
  if (!msg.id || !msg.threadId) return null;
  const headers = msg.payload?.headers ?? [];
  const header = (name: string): string | null => {
    const h = headers.find(
      (it) => it.name?.toLowerCase() === name.toLowerCase(),
    );
    return h?.value ?? null;
  };

  const from = header("From") ?? "";
  const { name: sender_name, email: sender_email } = parseFromHeader(from);
  const subject = header("Subject");
  const dateHeader = header("Date");
  const received_at = parseReceivedAt(dateHeader, msg.internalDate);

  const attachments_meta = collectAttachments(msg.payload ?? null);
  const body_preview = extractBodyPreview(msg.payload ?? null);

  return {
    gmail_message_id: msg.id,
    gmail_thread_id: msg.threadId,
    sender_name,
    sender_email,
    subject,
    snippet: msg.snippet ?? null,
    body_preview,
    received_at,
    has_attachments: attachments_meta.length > 0,
    attachments_meta,
  };
}

const FROM_REGEX = /^(?:"?([^"<]+?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/;

export function parseFromHeader(
  raw: string,
): { name: string | null; email: string | null } {
  const match = raw.trim().match(FROM_REGEX);
  if (!match) return { name: null, email: null };
  return {
    name: match[1]?.trim() || null,
    email: match[2]?.trim().toLowerCase() || null,
  };
}

function parseReceivedAt(
  dateHeader: string | null,
  internalDate: string | null | undefined,
): string {
  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (internalDate) {
    const parsed = new Date(Number(internalDate));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function collectAttachments(
  payload: gmail_v1.Schema$MessagePart | null,
): EmailAttachment[] {
  if (!payload) return [];
  const out: EmailAttachment[] = [];
  function walk(part: gmail_v1.Schema$MessagePart) {
    if (
      part.filename &&
      part.filename.length > 0 &&
      part.body?.attachmentId
    ) {
      out.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mime: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
      });
    }
    for (const p of part.parts ?? []) walk(p);
  }
  walk(payload);
  return out;
}

function decodeBase64Url(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractBodyPreview(
  payload: gmail_v1.Schema$MessagePart | null,
): string | null {
  if (!payload) return null;

  // Prefer text/plain anywhere in the tree, then text/html stripped, then
  // the payload body itself if it's a single-part message.
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) {
    return truncate(decodeBase64Url(plain.body.data));
  }
  const html = findPart(payload, "text/html");
  if (html?.body?.data) {
    return truncate(stripHtml(decodeBase64Url(html.body.data)));
  }
  if (payload.body?.data) {
    const raw = decodeBase64Url(payload.body.data);
    return truncate(
      payload.mimeType === "text/html" ? stripHtml(raw) : raw,
    );
  }
  return null;
}

function findPart(
  part: gmail_v1.Schema$MessagePart,
  mimeType: string,
): gmail_v1.Schema$MessagePart | null {
  if (part.mimeType === mimeType && part.body?.data) return part;
  for (const p of part.parts ?? []) {
    const hit = findPart(p, mimeType);
    if (hit) return hit;
  }
  return null;
}

function truncate(s: string): string {
  if (s.length <= BODY_PREVIEW_LIMIT) return s.trim();
  return `${s.slice(0, BODY_PREVIEW_LIMIT).trim()}…`;
}
