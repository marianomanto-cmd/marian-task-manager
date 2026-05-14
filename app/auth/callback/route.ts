import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inbox";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      // Persist the Google refresh token so syncs keep working after the
      // session's provider_token (access token, ~1h life) expires. Google
      // only returns it because login requests access_type=offline +
      // prompt=consent.
      const refreshToken = data.session.provider_refresh_token;
      if (!refreshToken) {
        // No refresh token means Google didn't grant offline access — the
        // user would hit "Missing Google provider token" again within the
        // hour, so flag it now instead of failing silently later.
        return NextResponse.redirect(
          `${origin}/login?error=no_refresh_token`,
        );
      }
      const { error: upsertError } = await supabase
        .from("user_settings")
        .upsert(
          {
            user_id: data.session.user.id,
            gmail_refresh_token: refreshToken,
          },
          { onConflict: "user_id" },
        );
      if (upsertError) {
        return NextResponse.redirect(
          `${origin}/login?error=token_persist_failed`,
        );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
