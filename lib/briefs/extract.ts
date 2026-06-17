import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { type BriefFields, emptyBriefFields } from "@/lib/briefs/types";

// Cheapest capable model; the only AI usage in the app. Overridable via env
// without touching code (e.g. BRIEFS_MODEL=claude-sonnet-4-6 for more accuracy).
const MODEL = process.env.BRIEFS_MODEL?.trim() || "claude-haiku-4-5";

const SYSTEM = `Sos un analista del equipo de medios que procesa "Briefs soporte PAGO en Redes Sociales" de Copa Airlines (campañas de boosting). Cada brief es un formulario en español con 25 preguntas numeradas y casillas que se marcan con una "X".

Tu tarea: leé el PDF —MIRÁ la página, no solo el texto, para ver qué casillas están tildadas con una X o x— y devolvé los campos para una tabla que usa el equipo de planificación de medios.

Reglas por campo:
- campaign_name: pregunta 4 "Nombre iniciativa".
- start_date: pregunta 5 "Fecha de inicio", tal cual aparece (ej: "16 de junio del 2026").
- end_date: pregunta 5 "Fecha de finalización", tal cual aparece (ej: "Hasta que rinda el presupuesto").
- objective: pregunta 7, la ÚNICA opción tildada con X (Awareness / Engagement / Performance / Subscriptions / Otros).
- kpi: pregunta 10, el ÚNICO KPI tildado con X (VCR, Clicks, CPC, CPV, CTR, Views, Tickets, Cost per Ticket, ROI, Interacciones, Followers).
- kpi_goals: pregunta 11 "Metas/Goals para el KPI", el texto tal cual.
- target_audience: pregunta 12 "Audiencia". Si el brief repite el mismo texto que las metas, redactá en su lugar un perfil de audiencia breve y útil deducido del contexto (a quién le habla la campaña: mercados, intereses como fútbol/viajes, etc.).
- social_networks: pregunta 13, lista de las redes tildadas con X separadas por coma (ej: "Instagram GL, Facebook, Instagram US, TikTok").
- markets: pregunta 14, combiná país y ciudad (ej: "Panamá (Panamá)" o "Colombia (Bogotá y Medellín), Argentina (Ezeiza), Costa Rica (San José)").
- link: pregunta 15 o 18, la URL (Instagram, landing, etc.) si existe. Si dice "Por enviar" o no hay, dejá vacío.
- investment: pregunta 21 "Inversión Medios" + pregunta 22 origen del budget (ej: "$3.000 (sin fee)").
- background: redactá vos un resumen claro de 2 a 4 oraciones, en español, para un media planner que nunca vio la campaña: de qué se trata la iniciativa, el momento/fecha, la marca (Copa Airlines), el contexto (Mundial / Copa, fútbol) y qué se busca lograr. Que sea entendible y cómodo de leer, sin la jerga ni la numeración del formulario.

Si un dato genuinamente no está, devolvé string vacío. No inventes datos. Respondé únicamente con el JSON del esquema.`;

const USER_PROMPT =
  "Procesá este brief y devolvé los campos para la tabla del equipo de medios.";

// Structured-outputs schema (json_schema): guarantees the response is exactly
// these string fields, so the model can't drift the shape.
const SCHEMA: { [key: string]: unknown } = {
  type: "object",
  additionalProperties: false,
  properties: {
    campaign_name: { type: "string" },
    start_date: { type: "string" },
    end_date: { type: "string" },
    markets: { type: "string" },
    objective: { type: "string" },
    investment: { type: "string" },
    kpi: { type: "string" },
    kpi_goals: { type: "string" },
    link: { type: "string" },
    background: { type: "string" },
    target_audience: { type: "string" },
    social_networks: { type: "string" },
  },
  required: [
    "campaign_name",
    "start_date",
    "end_date",
    "markets",
    "objective",
    "investment",
    "kpi",
    "kpi_goals",
    "link",
    "background",
    "target_audience",
    "social_networks",
  ],
};

/** Send the PDF to Claude and get back the media-planning fields. */
export async function extractBriefFromPdf(base64Pdf: string): Promise<BriefFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Falta configurar ANTHROPIC_API_KEY en las variables de entorno.",
    );
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Pdf,
            },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return coerceFields(text);
}

/** Parse + normalize the model output into a complete BriefFields object. */
function coerceFields(raw: string): BriefFields {
  const fields = emptyBriefFields();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Claude no devolvió un brief válido. Probá de nuevo.");
    }
    parsed = JSON.parse(match[0]);
  }

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of Object.keys(fields) as (keyof BriefFields)[]) {
      const value = record[key];
      if (typeof value === "string") fields[key] = value.trim();
      else if (value != null && typeof value !== "object") fields[key] = String(value);
    }
  }

  return fields;
}
