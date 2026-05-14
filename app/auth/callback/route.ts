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
      // prompt=consent; skip the write if it's somehow absent.
      const refreshToken = data.session.provider_refresh_token;
      if (refreshToken) {
        await supabase.from("user_settings").upsert(
          {
            user_id: data.session.user.id,
            gmail_refresh_token: refreshToken,
          },
          { onConflict: "user_id" },
        );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
