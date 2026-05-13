import {
  CLASSIFY_MODEL,
  estimateCostUsd,
  getAnthropicClient,
} from "@/lib/anthropic/client";
import {
  CLASSIFY_PROMPT_VERSION,
  CLASSIFY_SYSTEM_PROMPT,
  buildClassifyUserMessage,
} from "@/lib/anthropic/prompts";

export type ClassifyCategory =
  | "URGENTE"
  | "CLIENTE"
  | "PROVEEDOR"
  | "INTERNO"
  | "INFORMATIVO"
  | "OTROS";

export type ClassifySuggestedAction =
  | "responder"
  | "crear_tarea"
  | "archivar"
  | "derivar";

export type ClassifyInputItem = {
  id: string;
  from: string;
  subject: string;
  body_preview: string;
};

export type ClassifyResultItem = {
  id: string;
  category: ClassifyCategory;
  summary: string;
  priority: number;
  campaign_code: string | null;
  detected_deadline: string | null;
  suggested_action: ClassifySuggestedAction;
  requires_response: boolean;
};

export type BatchClassifyOutcome = {
  results: ClassifyResultItem[];
  failedBatches: Array<{ batchIndex: number; error: string }>;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  modelVersion: string;
  promptVersion: string;
};

const CATEGORY_SET = new Set<ClassifyCategory>([
  "URGENTE",
  "CLIENTE",
  "PROVEEDOR",
  "INTERNO",
  "INFORMATIVO",
  "OTROS",
]);
const ACTION_SET = new Set<ClassifySuggestedAction>([
  "responder",
  "crear_tarea",
  "archivar",
  "derivar",
]);

const BACKOFF_MS = 2_000;

/**
 * Classifies emails in batches of `batchSize`. Per SPEC §6.5: invalid JSON
 * in a batch is logged but the other batches still produce results — we
 * do NOT insert anything for the failed batch so its emails stay
 * unprocessed and get retried on the next sync.
 */
export async function batchClassify(
  emails: ClassifyInputItem[],
  batchSize = 10,
): Promise<BatchClassifyOutcome> {
  const outcome: BatchClassifyOutcome = {
    results: [],
    failedBatches: [],
    tokensInput: 0,
    tokensOutput: 0,
    estimatedCostUsd: 0,
    modelVersion: CLASSIFY_MODEL,
    promptVersion: CLASSIFY_PROMPT_VERSION,
  };
  if (emails.length === 0) return outcome;

  const client = getAnthropicClient();

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchIndex = i / batchSize;

    try {
      const { items, inputTokens, outputTokens } = await callClaudeOnce(
        client,
        batch,
      );
      // Only accept items whose id is in this batch — guards against the
      // model hallucinating ids.
      const allowedIds = new Set(batch.map((b) => b.id));
      for (const item of items) {
        if (allowedIds.has(item.id)) outcome.results.push(item);
      }
      outcome.tokensInput += inputTokens;
      outcome.tokensOutput += outputTokens;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // One retry with 2s backoff per SPEC §6.5.
      try {
        await new Promise((r) => setTimeout(r, BACKOFF_MS));
        const { items, inputTokens, outputTokens } = await callClaudeOnce(
          client,
          batch,
        );
        const allowedIds = new Set(batch.map((b) => b.id));
        for (const item of items) {
          if (allowedIds.has(item.id)) outcome.results.push(item);
        }
        outcome.tokensInput += inputTokens;
        outcome.tokensOutput += outputTokens;
      } catch (retryErr) {
        outcome.failedBatches.push({
          batchIndex,
          error:
            retryErr instanceof Error
              ? `${message}; retry: ${retryErr.message}`
              : message,
        });
      }
    }
  }

  outcome.estimatedCostUsd = estimateCostUsd(
    outcome.tokensInput,
    outcome.tokensOutput,
  );
  return outcome;
}

async function callClaudeOnce(
  client: ReturnType<typeof getAnthropicClient>,
  batch: ClassifyInputItem[],
): Promise<{
  items: ClassifyResultItem[];
  inputTokens: number;
  outputTokens: number;
}> {
  const response = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 2000,
    system: CLASSIFY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildClassifyUserMessage(batch) }],
  });

  const text = response.content
    .filter((block): block is { type: "text"; text: string } & typeof block =>
      block.type === "text",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();

  const items = parseClassifyJson(text);
  return {
    items,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Defensive JSON parser. Tries the raw text first; if Claude wrapped the
 * array in extra prose (despite the system prompt), extracts the first
 * `[...]` block. Filters out malformed items rather than rejecting the whole
 * batch.
 */
export function parseClassifyJson(text: string): ClassifyResultItem[] {
  const raw = pickJsonArray(text);
  if (!raw) throw new Error("La respuesta no contiene un JSON array.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `JSON inválido: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("El JSON no era un array.");
  }

  const items: ClassifyResultItem[] = [];
  for (const entry of parsed) {
    const item = coerceItem(entry);
    if (item) items.push(item);
  }
  return items;
}

function pickJsonArray(text: string): string | null {
  if (text.startsWith("[") && text.endsWith("]")) return text;
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function coerceItem(raw: unknown): ClassifyResultItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  const category = typeof r.category === "string" ? r.category : "";
  const action =
    typeof r.suggested_action === "string" ? r.suggested_action : "";
  if (!CATEGORY_SET.has(category as ClassifyCategory)) return null;
  if (!ACTION_SET.has(action as ClassifySuggestedAction)) return null;

  const priority =
    typeof r.priority === "number"
      ? Math.max(0, Math.min(100, Math.round(r.priority)))
      : 0;

  return {
    id: r.id,
    category: category as ClassifyCategory,
    summary: typeof r.summary === "string" ? r.summary : "",
    priority,
    campaign_code:
      typeof r.campaign_code === "string" && r.campaign_code.length > 0
        ? r.campaign_code
        : null,
    detected_deadline:
      typeof r.detected_deadline === "string" && r.detected_deadline.length > 0
        ? r.detected_deadline
        : null,
    suggested_action: action as ClassifySuggestedAction,
    requires_response: Boolean(r.requires_response),
  };
}
