import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAdminEmail, isSangriaEmail } from "@/lib/auth/admin";

/**
 * The team app. Everything else is public: the client links live at the root
 * of the URL space (`/copa`, `/cmi`, `/todos`, …) and their slugs are stored
 * in the database, so the proxy can't hold a list of them — it would have to
 * hit Postgres on every request. Listing what's *private* instead keeps the
 * check to a string compare, and a slug that matches nothing 404s in the page.
 */
const PROTECTED_PATHS = ["/tasks", "/projects", "/briefs", "/timeliner"];

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
  const isPublic = !isPathInList(path, PROTECTED_PATHS);

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

    // Already signed in and visiting /login: send to the right landing.
    if (path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = isAdminEmail(email) ? "/projects" : "/tasks";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
