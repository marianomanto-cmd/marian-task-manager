"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Pencil, Share2, ShieldOff, X } from "lucide-react";

import {
  getShareTokenAction,
  listClientsAction,
  revokeShareTokenAction,
  rotateShareTokenAction,
  updateClientSlugAction,
} from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showToast } from "@/components/ui/toast";
import { ALL_CLIENTS_SLUG } from "@/lib/projects/slug";
import type { Client } from "@/lib/projects/types";

const SHARE_KEY = ["projects-share-token"] as const;
const CLIENT_LINKS_KEY = ["projects-client-links"] as const;

export function ShareButton() {
  const [open, setOpen] = React.useState(false);
  const origin = useOrigin();

  const clientsQuery = useQuery({
    queryKey: CLIENT_LINKS_KEY,
    staleTime: 30_000,
    enabled: open,
    queryFn: async () => {
      const result = await listClientsAction();
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const clients = clientsQuery.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Share2 className="size-3.5" />
          Compartir
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Links para clientes</div>
          <p className="text-muted-foreground text-xs">
            Cada cliente abre su link y ve sólo sus proyectos y tareas — no ve
            los de los demás y no necesita cuenta. Sólo lectura, sin
            archivadas.
          </p>
        </div>

        {clientsQuery.isLoading ? (
          <p className="text-muted-foreground text-xs">Cargando…</p>
        ) : clientsQuery.isError ? (
          <p className="text-destructive text-xs">
            No pudimos cargar los clientes.
          </p>
        ) : clients.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Todavía no hay clientes. Agregá uno desde el menú “Cliente”.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {clients.map((client) => (
              <ClientLinkRow
                key={client.name}
                client={client}
                origin={origin}
              />
            ))}
          </ul>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <div className="text-xs font-semibold">Todos los clientes</div>
          <LinkChip
            url={origin ? `${origin}/${ALL_CLIENTS_SLUG}` : null}
            path={`/${ALL_CLIENTS_SLUG}`}
          />
          <p className="text-muted-foreground text-[11px]">
            El board entero en un solo link. Es para el equipo — no se lo pases
            a un cliente.
          </p>
        </div>

        <LegacyTokenShare origin={origin} />
      </PopoverContent>
    </Popover>
  );
}

function ClientLinkRow({
  client,
  origin,
}: {
  client: Client;
  origin: string | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(client.slug ?? "");

  const save = useMutation({
    mutationFn: async (slug: string) => {
      const result = await updateClientSlugAction({ name: client.name, slug });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: (updated) => {
      qc.setQueryData<Client[]>(CLIENT_LINKS_KEY, (prev) =>
        (prev ?? []).map((c) => (c.name === client.name ? updated : c)),
      );
      setEditing(false);
      showToast({
        title: "Link actualizado",
        description: `Ahora es /${updated.slug}. El anterior deja de funcionar.`,
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const path = client.slug ? `/${client.slug}` : null;
  const url = origin && client.slug ? `${origin}/${client.slug}` : null;

  if (editing) {
    return (
      <li className="space-y-1.5 rounded-md border p-2">
        <div className="text-xs font-medium">{client.name}</div>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <span className="text-muted-foreground text-xs">/</span>
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="copa"
            className="h-7 flex-1 text-xs"
            aria-label={`Link público de ${client.name}`}
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            className="size-7"
            disabled={save.isPending}
            aria-label="Guardar"
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              setDraft(client.slug ?? "");
              setEditing(false);
            }}
            aria-label="Cancelar"
          >
            <X className="size-3.5" />
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2">
      <span className="w-24 shrink-0 truncate text-xs font-medium">
        {client.name}
      </span>
      <LinkChip url={url} path={path} />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        onClick={() => {
          setDraft(client.slug ?? "");
          setEditing(true);
        }}
        aria-label={`Editar el link de ${client.name}`}
      >
        <Pencil className="size-3.5" />
      </Button>
    </li>
  );
}

/** The `/slug` pill plus its copy button. */
function LinkChip({ url, path }: { url: string | null; path: string | null }) {
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast({ title: "Link copiado", description: url });
    } catch {
      showToast({ title: "No pudimos copiar el link" });
    }
  }

  if (!path) {
    return (
      <span className="text-muted-foreground flex-1 text-[11px]">
        Sin link todavía
      </span>
    );
  }

  return (
    <div className="bg-muted/40 flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1">
      <Link2 className="text-muted-foreground size-3.5 shrink-0" />
      <code className="truncate text-[11px]">{path}</code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="ml-auto size-6 shrink-0"
        onClick={copy}
        disabled={!url}
        aria-label="Copiar link"
      >
        <Copy className="size-3" />
      </Button>
    </div>
  );
}

/**
 * The original single-token link (`/p/<uuid>`). Superseded by the per-client
 * links above, but kept so tokens already sent to clients keep working — and
 * so they can be revoked from here.
 */
function LegacyTokenShare({ origin }: { origin: string | null }) {
  const qc = useQueryClient();
  const [shown, setShown] = React.useState(false);

  const tokenQuery = useQuery({
    queryKey: SHARE_KEY,
    staleTime: 60_000,
    enabled: shown,
    queryFn: async () => {
      const result = await getShareTokenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data.token;
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const result = await rotateShareTokenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data.token;
    },
    onSuccess: (token) => {
      qc.setQueryData(SHARE_KEY, token);
      showToast({
        title: "Link generado",
        description: "El link anterior dejó de funcionar.",
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const result = await revokeShareTokenAction();
      if (!result.ok) throw new Error(result.message);
      return result.data.token;
    },
    onSuccess: (token) => {
      qc.setQueryData(SHARE_KEY, token);
      showToast({
        title: "Link revocado",
        description: "Nadie con el link anterior puede ver el board.",
      });
    },
    onError: (err: Error) => showToast({ title: err.message }),
  });

  if (!shown) {
    return (
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground border-t pt-3 text-left text-[11px] underline-offset-2 hover:underline"
        onClick={() => setShown(true)}
      >
        Link viejo por token (/p/…)
      </button>
    );
  }

  const token = tokenQuery.data ?? null;
  const url = token && origin ? `${origin}/p/${token}` : null;

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-xs font-semibold">Link viejo por token</div>
      <p className="text-muted-foreground text-[11px]">
        Muestra el board entero. Revocalo si ya repartiste los links por
        cliente.
      </p>
      {tokenQuery.isLoading ? (
        <p className="text-muted-foreground text-xs">Cargando…</p>
      ) : token ? (
        <>
          <LinkChip url={url} path={`/p/${token.slice(0, 8)}…`} />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (
                  confirm("¿Generar un link nuevo? El anterior deja de funcionar.")
                )
                  rotateMutation.mutate();
              }}
              disabled={rotateMutation.isPending}
            >
              Rotar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("¿Revocar el link compartido?"))
                  revokeMutation.mutate();
              }}
              disabled={revokeMutation.isPending}
            >
              <ShieldOff className="size-3.5" />
              Revocar
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => rotateMutation.mutate()}
          disabled={rotateMutation.isPending}
        >
          <Link2 />
          Generar link
        </Button>
      )}
    </div>
  );
}

/**
 * `window.location.origin`, read through useSyncExternalStore so it is
 * available synchronously after hydration without a setState-in-effect.
 */
function useOrigin(): string | null {
  return React.useSyncExternalStore(
    () => () => {},
    () => (typeof window === "undefined" ? null : window.location.origin),
    () => null,
  );
}
