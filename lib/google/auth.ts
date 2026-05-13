import { google } from "googleapis";

import { createClient } from "@/lib/supabase/server";

/**
 * Thrown when we can't reach a Google API because there's no active session
 * or the session is missing the OAuth provider token. UI catches it and
 * prompts the user to sign in again.
 */
export class GoogleAuthRequiredError extends Error {
  constructor(message = "Google authorization required. Sign in again.") {
    super(message);
    this.name = "GoogleAuthRequiredError";
  }
}

/**
 * Reads the Google access token Supabase Auth stored on the active session
 * after the user signed in. Valid ~1h. When it expires the user re-logs in;
 * we deliberately do NOT persist a refresh token yet (manual sync only).
 */
export async function getProviderAccessToken(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new GoogleAuthRequiredError("No active session.");
  }
  const token = data.session.provider_token;
  if (!token) {
    throw new GoogleAuthRequiredError(
      "Missing Google provider token. Sign in again to grant access.",
    );
  }
  return token;
}

/**
 * Builds a configured googleapis OAuth2 client. Each API client (calendar,
 * gmail) takes this and instantiates its own typed wrapper.
 */
export async function getGoogleAuthClient() {
  const accessToken = await getProviderAccessToken();
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}
