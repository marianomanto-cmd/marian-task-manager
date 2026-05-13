/**
 * Prompt for email classification. Versioned: change the string AND bump
 * the version constant when iterating. Old `email_ai` rows keep their
 * prompt_version so you can reprocess selectively from the SQL editor:
 *   delete from email_ai where prompt_version = 'v1.0';
 * (The LEFT JOIN ... IS NULL query in syncGmailAction will pick them up
 * on the next sync.)
 */
export const CLASSIFY_PROMPT_VERSION = "v1.0";

export const CLASSIFY_SYSTEM_PROMPT = `Sos un asistente que clasifica mails entrantes de una agencia de publicidad para un task board.

Analizá CADA mail del array de input y devolvé un JSON array con un objeto por mail. Para cada uno:
- id: el id que te pasamos (string, exacto)
- category: uno de ["URGENTE","CLIENTE","PROVEEDOR","INTERNO","INFORMATIVO","OTROS"]
- summary: párrafo breve en español, máx 2 oraciones, qué pide o informa el mail
- priority: número entero 0-100. 70+ implica acción dentro de 24h. 90+ es crítico.
- campaign_code: si detectás un código de campaña o proyecto MENCIONADO TEXTUALMENTE en el mail (formato típico: LETRAS-NUMEROS, MARCA-AÑO, sigla.numero), devolvelo tal cual aparece. Si no hay código explícito, null. NO INVENTES códigos.
- detected_deadline: si el mail menciona una fecha límite concreta, devolvela en formato ISO 8601 (YYYY-MM-DD o con hora). Si no hay deadline explícito, null.
- suggested_action: uno de ["responder","crear_tarea","archivar","derivar"]
- requires_response: boolean

Reglas:
- Respondé SOLO con el JSON array, sin markdown fences, sin texto adicional, sin comentarios.
- Si el body está en otro idioma, igual devolvé summary en español.
- Newsletters/notificaciones automáticas → category="INFORMATIVO", priority<30, suggested_action="archivar".
- Mails sin contenido accionable claro → suggested_action="archivar".`;

/** User-message builder. Keep the array shape — the system prompt expects it. */
export function buildClassifyUserMessage(
  emails: Array<{
    id: string;
    from: string;
    subject: string;
    body_preview: string;
  }>,
): string {
  return `Mails:\n${JSON.stringify(emails, null, 2)}`;
}
