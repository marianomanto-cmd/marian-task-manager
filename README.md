# Agency Board

App interna de la agencia. Dos pestañas:

- **Mi board** (`/tasks`): tareas asignables a cualquier miembro del equipo. Cada uno usa su propio board si quiere (filtros "Sólo mías"). Visible para todo el equipo, sin notificaciones externas.
- **Proyectos** (`/projects`): board de pendientes que Mariano comparte con clientes. Filas agrupadas por proyecto (o por cliente) con categoría, status, due date, link y nota. Cada proyecto puede asignarse a un cliente. Sólo Mariano edita; todo el equipo lo ve.
- **Vista compartida** (`/p/<token>`): link público de sólo lectura para clientes. Se genera/rota/revoca desde el botón "Compartir" en Proyectos.

Login con Google (cuentas `@sangria.agency`). Sin integraciones con Gmail, Calendar, ni Slack.

### Proyectos: features clave

- Clientes: cada proyecto pertenece (opcional) a un cliente. Lista gestionable desde el botón "Clientes" (agregar/quitar). Al quitar un cliente, sus proyectos quedan "Sin cliente".
- Agrupación con toggle **Proyecto / Cliente**. En vista Cliente se ve la jerarquía Cliente → Proyecto → Tareas.
- Filtro de clientes (chips multi-selección, incluye "Sin cliente").
- Renombrar proyecto: click directo sobre el nombre en el header y escribir encima (Enter o salir guarda, Escape cancela).
- Drag & drop para reordenar tareas dentro de un proyecto y proyectos entre sí (sólo en vista Proyecto).
- Color + emoji por proyecto (icono en el header de cada grupo); el cliente se asigna desde el mismo editor.
- Status con barra de color a la izquierda de cada fila (pending=rojo, ongoing=verde, waiting=azul, done=gris).
- Due date con badges relativos ("Hoy", "Mañana", "d MMM") y snooze rápido (+1d, próx. lunes, +1sem, +2sem).
- Densidad cómoda/compacta.
- Archivo (`A`): tareas archivadas se ocultan; el cliente sólo ve activas.
- Búsqueda full-text (`/`).
- Export CSV.
- Atajos: `N` nueva tarea · `/` buscar · `A` toggle archivo.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind v4 + shadcn/ui
- Supabase Auth (Google OAuth) + Postgres
- TanStack Query, Zod, `date-fns`

## Setup

1. `npm install`
2. `.env.local` con:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ADMIN_EMAIL=mariano.mantovani@sangria.agency`
3. En Supabase: aplicar las migraciones de `supabase/migrations/`.
4. Authentication → URL Configuration → Redirect URLs: `http://localhost:3000/auth/callback` y el dominio de producción.
5. Authentication → Providers → Google: Client ID + Secret. No hace falta agregar scopes extra.
6. `npm run dev`

## Scripts

- `npm run dev` — servidor local
- `npm run build` — build de producción
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
