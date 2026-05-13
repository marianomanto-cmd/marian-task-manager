import { redirect } from "next/navigation";

import { LoginButton } from "./login-button";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Iniciar sesión · Agency Board",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/inbox");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Agency Board
          </h1>
          <p className="text-muted-foreground text-sm">
            Iniciá sesión con tu cuenta de Google para acceder a tu bandeja y
            tareas.
          </p>
        </div>
        <LoginButton />
      </div>
    </main>
  );
}
