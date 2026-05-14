import type Anthropic from "@anthropic-ai/sdk";

import { CLASSIFY_MODEL, getAnthropicClient } from "@/lib/anthropic/client";
import type { createClient } from "@/lib/supabase/server";
import type { TaskPriority } from "@/lib/tasks/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Agent that decides whether an email warrants a task and, if so, creates it
 * via the `create_task` tool. Priority is the agent's call:
 *   - ambiguous / low signal → "low"
 *   - clear & relevant      → "medium"
 *   - urgent / deadline     → "high"
 *
 * The loop is bounded by MAX_AGENT_TURNS to keep cost predictable. The agent
 * is expected to make at most one create_task call per email; multiple calls
 * are tolerated (rare) so it can split an email into separate tasks if it
 * judges that helpful.
 */

const MAX_AGENT_TURNS = 4;
const AGENT_MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `Sos un agente de triage para una agencia de publicidad. Te paso UN mail. Decidí si amerita crear una tarea en el task board.

REGLAS de decisión:
- Si el mail tiene un pedido o acción concreta, creá UNA tarea con la herramienta create_task.
- Si el pedido es claro y relevante para el negocio (cliente pide algo, deadline cercano, decisión pendiente) → priority="medium".
- Si tiene urgencia explícita (hoy, ASAP, deadline en <24h, palabra "urgente") o un deadline crítico → priority="high".
- Si el contenido es ambiguo, podría o no ser accionable, o es un pedido vago/exploratorio → priority="low".
- Si es newsletter, notificación automática, confirmación trivial o claramente no requiere acción → NO llames a la herramienta. Respondé con un texto breve explicando por qué.

Reglas de output:
- Título en español, máx 200 chars, accionable (empezá con verbo cuando sea posible).
- notes: contexto breve del mail (1-3 oraciones). Incluí remitente si ayuda.
- due_date: solo si el mail menciona una fecha concreta (YYYY-MM-DD). Si no, omitilo.
- Una sola tool call por mail salvo que el mail contenga acciones realmente independientes.`;

export type CreateTaskToolInput = {
  title: string;
  priority: TaskPriority;
  notes?: string | null;
  due_date?: string | null;
};

export type AgentCreatedTask = {
  taskId: string;
  title: string;
  priority: TaskPriority;
};

export type RunTaskAgentInput = {
  email: {
    id: string;
    from: string;
    subject: string;
    body_preview: string;
  };
  /** Hints from the classifier — passed to the agent as extra context. */
  classifierHint?: {
    summary?: string;
    detectedDeadline?: string | null;
    priorityScore?: number;
  };
  supabase: SupabaseServerClient;
  userId: string;
  memberKey: string | null;
  actorEmail: string | null;
};

export type RunTaskAgentOutcome = {
  tasksCreated: AgentCreatedTask[];
  inputTokens: number;
  outputTokens: number;
  /** When the model ran but declined to create a task. */
  declined: boolean;
  /** Set if the loop failed irrecoverably. */
  error: string | null;
};

const CREATE_TASK_TOOL: Anthropic.Messages.Tool = {
  name: "create_task",
  description:
    "Creates a task in the user's task board, assigned to the current user. Use exactly when the email contains a concrete action item. Set priority based on urgency and clarity.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description:
          "Título corto y accionable en español (máx 200 chars). Empezá con verbo si podés.",
      },
      priority: {
        type: "string",
        enum: ["low", "medium", "high"],
        description:
          "low = ambiguo / no claro; medium = pedido claro y relevante; high = urgente o deadline crítico.",
      },
      notes: {
        type: "string",
        description:
          "Contexto breve (1-3 oraciones) en español. Mencioná remitente y qué pide.",
      },
      due_date: {
        type: "string",
        description:
          "Fecha límite en formato YYYY-MM-DD. Solo si el mail menciona una fecha concreta.",
      },
    },
    required: ["title", "priority"],
  },
} as const;

export async function runTaskAgent(
  input: RunTaskAgentInput,
): Promise<RunTaskAgentOutcome> {
  const client = getAnthropicClient();
  const outcome: RunTaskAgentOutcome = {
    tasksCreated: [],
    inputTokens: 0,
    outputTokens: 0,
    declined: false,
    error: null,
  };

  const userText = buildUserMessage(input);
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userText },
  ];

  try {
    for (let turn = 0; turn < MAX_AGENT_TURNS; turn += 1) {
      const response = await client.messages.create({
        model: CLASSIFY_MODEL,
        max_tokens: AGENT_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [CREATE_TASK_TOOL],
        messages,
      });

      outcome.inputTokens += response.usage.input_tokens;
      outcome.outputTokens += response.usage.output_tokens;

      if (response.stop_reason !== "tool_use") {
        if (outcome.tasksCreated.length === 0) outcome.declined = true;
        return outcome;
      }

      const toolUses = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      );
      if (toolUses.length === 0) {
        if (outcome.tasksCreated.length === 0) outcome.declined = true;
        return outcome;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.name !== "create_task") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `Tool "${tu.name}" no existe. Usá solo create_task.`,
            is_error: true,
          });
          continue;
        }
        const parsed = parseToolInput(tu.input);
        if (!parsed.ok) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: parsed.error,
            is_error: true,
          });
          continue;
        }
        const created = await persistTask(parsed.value, input);
        if (!created.ok) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: created.error,
            is_error: true,
          });
          continue;
        }
        outcome.tasksCreated.push({
          taskId: created.taskId,
          title: parsed.value.title,
          priority: parsed.value.priority,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Tarea creada (id=${created.taskId}, priority=${parsed.value.priority}). Si no hay más acciones, terminá el turno.`,
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
    // Loop budget exhausted — return what we have.
    return outcome;
  } catch (err) {
    outcome.error = err instanceof Error ? err.message : String(err);
    return outcome;
  }
}

function buildUserMessage(input: RunTaskAgentInput): string {
  const lines: string[] = [
    "Mail a analizar:",
    `- de: ${input.email.from}`,
    `- asunto: ${input.email.subject || "(sin asunto)"}`,
    `- preview: ${input.email.body_preview || "(sin contenido)"}`,
  ];
  if (input.classifierHint) {
    if (input.classifierHint.summary) {
      lines.push(`- resumen del clasificador: ${input.classifierHint.summary}`);
    }
    if (typeof input.classifierHint.priorityScore === "number") {
      lines.push(
        `- score de prioridad del clasificador: ${input.classifierHint.priorityScore}/100`,
      );
    }
    if (input.classifierHint.detectedDeadline) {
      lines.push(
        `- deadline detectado: ${input.classifierHint.detectedDeadline}`,
      );
    }
  }
  lines.push(
    "",
    "Decidí: ¿amerita una tarea? Si sí, llamá create_task con la prioridad adecuada. Si no, respondé un texto corto.",
  );
  return lines.join("\n");
}

type ParseResult =
  | { ok: true; value: CreateTaskToolInput }
  | { ok: false; error: string };

function parseToolInput(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "input vacío o no objeto" };
  }
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return { ok: false, error: "title requerido" };
  if (title.length > 500) {
    return { ok: false, error: "title supera 500 chars" };
  }
  const priority = r.priority;
  if (priority !== "low" && priority !== "medium" && priority !== "high") {
    return { ok: false, error: "priority debe ser low|medium|high" };
  }
  const notes =
    typeof r.notes === "string" && r.notes.trim().length > 0
      ? r.notes.trim().slice(0, 8000)
      : null;
  const dueRaw = typeof r.due_date === "string" ? r.due_date.trim() : "";
  const dueMatch = dueRaw.match(/^(\d{4}-\d{2}-\d{2})/);
  const due_date = dueMatch ? dueMatch[1] : null;
  return { ok: true, value: { title, priority, notes, due_date } };
}

type PersistResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

async function persistTask(
  values: CreateTaskToolInput,
  input: RunTaskAgentInput,
): Promise<PersistResult> {
  const supabase = input.supabase;

  // Skip if a task already exists for this email — prevents duplicates if
  // the user runs the analyzer twice over the same email.
  const { data: existing } = await supabase
    .from("tasks")
    .select("id")
    .eq("email_id", input.email.id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: `Ya existe una tarea para este mail (id=${existing.id}).` };
  }

  const { data: insertRow, error: insertErr } = await supabase
    .from("tasks")
    .insert({
      user_id: input.userId,
      email_id: input.email.id,
      title: values.title,
      notes: values.notes,
      status: "todo",
      priority: values.priority,
      due_date: values.due_date,
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };
  if (!insertRow) return { ok: false, error: "insert sin id" };

  const taskId = insertRow.id as string;

  if (input.memberKey) {
    const { error: assignErr } = await supabase.from("task_assignees").insert({
      task_id: taskId,
      member_key: input.memberKey,
      assigned_by: input.userId,
    });
    // Don't fail the whole creation if assignee insert fails (e.g. duplicate).
    if (assignErr && !assignErr.message.toLowerCase().includes("duplicate")) {
      // Surface as a soft error in tool_result so the agent knows.
      return { ok: true, taskId };
    }
  }

  // Best-effort activity log; never fails the action.
  try {
    await supabase.from("task_activity").insert({
      task_id: taskId,
      actor_user_id: input.userId,
      actor_email: input.actorEmail,
      action: "created",
      payload: {
        title: values.title,
        source: "ai_agent",
        email_id: input.email.id,
      },
    });
  } catch {
    /* swallow */
  }

  return { ok: true, taskId };
}
