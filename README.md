# Agency Board

App interna de la agencia. Dos pestañas:

- **Mi board** (`/tasks`): tareas asignables a cualquier miembro del equipo. Cada uno usa su propio board si quiere (filtros "Sólo mías"). Visible para todo el equipo, sin notificaciones externas.
- **Proyectos** (`/projects`): board de pendientes que Mariano comparte con clientes. Organizado por cliente → proyecto → tareas, con categoría, status, due date, link y nota. Creación top-down: elegís un cliente, creás sus proyectos, y dentro de cada proyecto cargás las tareas. Sólo Mariano edita; todo el equipo lo ve.
- **Vista compartida** (`/p/<token>`): link público de sólo lectura para clientes. Se genera/rota/revoca desde el botón "Compartir" en Proyectos.
- **Board - Mely** (`/boardmely`) y **Board - Yiss** (`/boardyiss`): copias independientes del board de Proyectos, una por clienta externa. Son **públicas y sin login** (se accede directo por el link), con edición completa. Usan "Grupos" en vez de "Clientes" y guardan sus datos en tablas aisladas (`mely_*` / `yiss_*`). No aparecen en el menú del equipo; sin sesión, la app manda a login (no ven `/projects` ni `/tasks`).

Login con Google (cuentas `@sangria.agency`). Sin integraciones con Gmail, Calendar, ni Slack.

> Board - Mely y Board - Yiss requieren aplicar las migraciones `supabase/migrations/0021_mely_board.sql` y `0022_yiss_board.sql`.

### Proyectos: features clave

- Filtro de cliente en pestañas arriba de la sección: `[Todos] [Cliente] …`. Es **sólo un filtro**: click para ver sólo ese cliente. "Sin cliente" agrupa los proyectos sin asignar.
- Gestión de clientes separada del filtro: el botón "Gestionar" abre un popover para agregar/quitar clientes. Quitar un cliente deja sus proyectos como "Sin cliente".
- Crear es top-down: "Nuevo proyecto" (`N`, o el botón `+ Nuevo proyecto` dentro de cada cliente) pide cliente + nombre del proyecto + primera tarea, y deja el proyecto listo. Después sumás más tareas con el campo "Nueva tarea…" al pie de cada proyecto. No quedan proyectos vacíos.
- El board muestra la jerarquía Cliente → Proyectos → Tareas. Cada cliente es colapsable. Seleccionar un cliente sin proyectos muestra un atajo para crear el primero.
- Cada proyecto (dentro de su cliente) conserva sus controles: colapsar/expandir, renombrar inline (click en el nombre), color + emoji (ícono de paleta), mover a otro cliente y eliminar (menú `⋯`).
- Archivar proyectos: botón de archivar en cada proyecto para retirarlo a medida que se completa (archiva todas sus tareas); en la vista Archivo se reactiva.
- Drag & drop para reordenar tareas dentro de cada proyecto.
- Status con barra de color a la izquierda de cada fila (pending=rojo, ongoing=verde, waiting=azul, done=gris).
- Due date con badges relativos ("Hoy", "Mañana", "d MMM") y snooze rápido (+1d, próx. lunes, +1sem, +2sem).
- Botón "Filtros": muestra/oculta los filtros de Status y Categoría para liberar espacio.
- Archivo (`A`): tareas/proyectos archivados se ocultan; el cliente sólo ve activos.
- Búsqueda full-text (`/`).
- Export CSV.
- Atajos: `N` nuevo proyecto · `/` buscar · `A` toggle archivo.

Board - Mely y Board - Yiss comparten estas features (con "Grupos" en lugar de "Clientes"); no incluyen el botón "Compartir" porque el board ya es el link público.

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
