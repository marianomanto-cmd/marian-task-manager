# Agency Board

Web app para una agencia de publicidad: centraliza tareas y procesa mails entrantes con IA. Ver [`SPEC.md`](./SPEC.md) para el detalle completo del producto.

Este repo está en **Fase 0 — Foundation**: shell deployable, login con Google, layout principal con relojes y theme toggle, y placeholders para las cuatro páginas. El procesamiento de Gmail y la IA llegan en fases siguientes.

## Stack actual

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4 + shadcn/ui (neutral, new-york)
- Supabase Auth (Google OAuth, scope `gmail.readonly`)
- `next-themes` para light/dark/system con persistencia
- TanStack Query, Zod, `date-fns` + `date-fns-tz`

## Setup local

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear `.env.local` a partir de `.env.example` y completar los valores.
3. En **Supabase**:
   - Crear el proyecto.
   - Authentication → URL Configuration → agregar `http://localhost:3000/auth/callback` y la URL de producción a Redirect URLs.
   - Authentication → Providers → Google: pegar Client ID y Secret. En "Additional Scopes" agregar `https://www.googleapis.com/auth/gmail.readonly`.
4. En **Google Cloud Console**:
   - Crear OAuth Client (Web app).
   - Authorized redirect URIs: el `https://<project-ref>.supabase.co/auth/v1/callback` que figura en la pantalla de Supabase Google provider.
   - Habilitar la **Gmail API** en el proyecto (necesario para fases siguientes).
5. Arrancar:
   ```bash
   npm run dev
   ```

## Scripts

- `npm run dev` — servidor local en `http://localhost:3000`
- `npm run build` — build de producción
- `npm run start` — servir la build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`

## Deploy a Vercel

1. Import del repo en Vercel.
2. Project Settings → Environment Variables: cargar todas las variables de `.env.example`.
3. Después del primer deploy, copiar la URL de producción a:
   - Supabase → Authentication → URL Configuration → Site URL **y** Redirect URLs (`https://<tu-dominio>/auth/callback`).
   - Google Cloud → OAuth Client → Authorized JavaScript origins.

## Branching

- Trabajo de Fase 0 vive en `claude/agency-board-spec-u1xb7`.
- Ramas siguientes: `fase-1-tasks`, `fase-2-gmail-sync`, etc. Merge a `main` solo cuando la fase está verificada en producción.

## Verificación de Fase 0

- [ ] Login con Google funciona en producción
- [ ] Toggle claro/oscuro funciona y persiste
- [ ] Relojes muestran horas correctas en las 4 zonas (PTY, MIA, ARG, ESP)
- [ ] Mobile y desktop se ven bien (bottom nav en mobile, sidebar en desktop)
