"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        scopes:
          "openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar.events",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={handleSignIn}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? "Redirigiendo…" : "Continuar con Google"}
      </Button>
      {error && (
        <p className="text-destructive text-center text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
