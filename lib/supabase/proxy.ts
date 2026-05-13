import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmail, isSangriaEmail } from "@/lib/auth/admin";

const PUBLIC_PATHS = ["/login", "/auth/callback"];
const ADMIN_ONLY_PATHS = ["/inbox", "/calendar"];

function isPathInList(path: string, list: readonly string[]): boolean {
  return list.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env vars are missing (e.g. preview without secrets) skip auth checks
  // to keep the app bootable rather than crashing every request.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = isPathInList(path, PUBLIC_PATHS);

  // No session: bounce to /login (unless already there).
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const email = user.email ?? null;

    // Reject any email outside the agency domain. The user is signed in
    // because Google OAuth succeeded, but we don't want non-sangria.agency
    // accounts using the app — sign them out and surface the error.
    if (!isSangriaEmail(email) && !isPublic) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "domain");
      return NextResponse.redirect(url);
    }

    // Hide Bandeja + Calendario from non-admin team members. Direct-URL
    // attempts get bounced to /tasks (the team's primary entry point).
    if (
      !isPublic &&
      !isAdminEmail(email) &&
      isPathInList(path, ADMIN_ONLY_PATHS)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/tasks";
      return NextResponse.redirect(url);
    }

    // Already signed in and visiting /login: send to the right landing.
    if (path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = isAdminEmail(email) ? "/inbox" : "/tasks";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
