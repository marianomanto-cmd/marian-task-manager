import { redirect } from "next/navigation";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
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
    <div className="flex min-h-screen flex-1 flex-col">
      <Header
        isAdmin={isAdmin}
        user={{
          email: user.email ?? null,
          name: meta.full_name ?? meta.name ?? null,
          avatarUrl: meta.avatar_url ?? meta.picture ?? null,
        }}
      />
      <div className="flex flex-1">
        <Sidebar isAdmin={isAdmin} />
        <main className={isAdmin ? "flex-1 pb-16 md:pb-0" : "flex-1"}>
          {children}
        </main>
      </div>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
