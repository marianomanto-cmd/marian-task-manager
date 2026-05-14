import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

import { LoginButton } from "./login-button";

export const metadata = {
  title: "Iniciar sesión · Agency Board",
};

const ERROR_MESSAGES: Record<string, string> = {
  domain:
    "Tu cuenta no pertenece al dominio @sangria.agency. Pedile a Mariano que te sume.",
  auth_callback_failed:
    "No pudimos completar el login con Google. Probá de nuevo.",
  no_refresh_token:
    "Google no otorgó acceso offline. Volvé a iniciar sesión y aceptá todos los permisos.",
  token_persist_failed:
    "No pudimos guardar el acceso a Google. Probá de nuevo en unos segundos.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(isAdminEmail(user.email) ? "/inbox" : "/tasks");
  }

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? null : null;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Agency Board
          </h1>
          <p className="text-muted-foreground text-sm">
            Iniciá sesión con tu cuenta de Google de Sangria.
          </p>
        </div>
        {errorMessage ? (
          <p
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-center text-sm"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        <LoginButton />
      </div>
    </main>
  );
}
