import { google, type calendar_v3 } from "googleapis";

import { createClient } from "@/lib/supabase/server";

/**
 * Strategy: single-user app reads the access token that Supabase stores on
 * the active session after Google OAuth (`session.provider_token`). Valid
 * for ~1h. When it expires the user re-logs in. We deliberately do NOT
 * persist the refresh token yet — that lands when Gmail sync needs
 * background access.
 */

export class GoogleAuthRequiredError extends Error {
  constructor(message = "Google authorization required. Sign in again.") {
    super(message);
    this.name = "GoogleAuthRequiredError";
  }
}

async function getProviderAccessToken(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new GoogleAuthRequiredError("No active session.");
  }
  const token = data.session.provider_token;
  if (!token) {
    throw new GoogleAuthRequiredError(
      "Missing Google provider token. Sign in again to grant calendar access.",
    );
  }
  return token;
}

export async function getCalendarClient(): Promise<calendar_v3.Calendar> {
  const accessToken = await getProviderAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}
