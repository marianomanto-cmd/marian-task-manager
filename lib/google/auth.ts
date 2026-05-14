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
 * Builds a configured googleapis OAuth2 client.
 *
 * Supabase only keeps the Google `provider_token` (access token, ~1h life)
 * on the session right after login and never refreshes it. To keep syncs
 * working past that window we persist the `provider_refresh_token` in
 * `user_settings.gmail_refresh_token` at login time (see the auth callback)
 * and hand it to the OAuth2 client here, so googleapis can mint fresh access
 * tokens on demand.
 *
 * Each API client (calendar, gmail) takes this and instantiates its own
 * typed wrapper.
 */
export async function getGoogleAuthClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new GoogleAuthRequiredError("No active session.");
  }

  const accessToken = data.session.provider_token ?? null;

  const { data: settings } = await supabase
    .from("user_settings")
    .select("gmail_refresh_token")
    .eq("user_id", data.session.user.id)
    .single();
  const refreshToken = settings?.gmail_refresh_token ?? null;

  if (!accessToken && !refreshToken) {
    throw new GoogleAuthRequiredError(
      "Missing Google provider token. Sign in again to grant access.",
    );
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  );
  auth.setCredentials({
    access_token: accessToken ?? undefined,
    refresh_token: refreshToken ?? undefined,
  });
  return auth;
}
