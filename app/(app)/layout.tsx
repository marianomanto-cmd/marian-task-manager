import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { isAdminEmail } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  const isAdmin = isAdminEmail(user.email);

  return (
    <AppShell
      isAdmin={isAdmin}
      user={{
        email: user.email ?? null,
        name: meta.full_name ?? meta.name ?? null,
        avatarUrl: meta.avatar_url ?? meta.picture ?? null,
      }}
    >
      {children}
    </AppShell>
  );
}
