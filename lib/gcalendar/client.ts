import { google, type calendar_v3 } from "googleapis";

import { getGoogleAuthClient } from "@/lib/google/auth";

// Re-exported for callers that still import from this module.
export { GoogleAuthRequiredError } from "@/lib/google/auth";

export async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const auth = await getGoogleAuthClient();
  return google.calendar({ version: "v3", auth });
}
