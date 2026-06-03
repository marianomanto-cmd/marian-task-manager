# Agency Board

App interna de la agencia. El shell tiene una **barra lateral colapsable** (botón en el header, preferencia recordada por navegador) y el contenido usa todo el ancho disponible. Pestañas:

- **Mi board** (`/tasks`): tareas asignables a cualquier miembro del equipo. Cada uno usa su propio board si quiere (filtros "Sólo mías"). Visible para todo el equipo, sin notificaciones externas.
- **Proyectos** (`/projects`): board de pendientes que Mariano comparte con clientes. Organizado por cliente → proyecto → tareas, con categoría, status, due date, link y nota. Creación top-down: elegís un cliente, creás sus proyectos, y dentro de cada proyecto cargás las tareas. **Sólo Mariano edita; lo ve y navega todo el equipo** (la pestaña ya no está restringida al admin).
- **Timeliner** (`/timeliner`): creador de timelines/Gantt para el equipo. Varios timelines (pestañas), tareas con duración, hitos, owners (lista del equipo), arrastrar para mover/estirar barras, fines de semana y feriados por país (AR/PA/US/ES) con toggle on/off, y export a Excel (.xlsx con grilla coloreada). Visible y editable por cualquier miembro logueado.
- **Vista compartida** (`/p/<token>`): link público de sólo lectura para clientes. Se genera/rota/revoca desde el botón "Compartir" en Proyectos.
- **Boards de clientas** — **Board - Mely** (`/boardmely`), **Board - Yiss** (`/boardyiss`), **Board - Mafe** (`/boardmafe`) y **Board - Nadine** (`/boardnadine`): copias independientes del board de Proyectos, una por clienta externa. Son **públicas y sin login** (se accede directo por el link), con edición completa. Usan "Grupos" en vez de "Clientes" y guardan sus datos en tablas aisladas (`mely_*` / `yiss_*` / `mafe_*` / `nadine_*`). No aparecen en el menú del equipo; sin sesión, la app manda a login (no ven `/projects` ni `/tasks`).

Login con Google (cuentas `@sangria.agency`). Sin integraciones con Gmail, Calendar, ni Slack.

> Los boards de clientas requieren aplicar las migraciones `supabase/migrations/0021_mely_board.sql`, `0022_yiss_board.sql`, `0023_mafe_board.sql` y `0026_nadine_board.sql`.
>
> Timeliner requiere aplicar `supabase/migrations/0024_timeliner.sql` (usa la tabla `holidays` ya existente).

### Proyectos: features clave

- Filtros como menús desplegables en el toolbar: **Cliente** (un valor: `Todos` / cliente / `Sin cliente`), **Status** y **Categoría** (multi-select), cada uno en su propio botón `▾`. Un contador en el botón avisa cuántas opciones están acotadas; así los filtros no roban alto a la lista. La búsqueda queda en su propio campo del toolbar.
- Gestión de clientes (sólo admin) integrada al pie del menú **Cliente**: agregás/quitás clientes sin abrir otro menú. Quitar un cliente deja sus proyectos como "Sin cliente".
- Crear es top-down: "Nuevo proyecto" (`N`, o el botón `+ Nuevo proyecto` dentro de cada cliente) pide cliente + nombre del proyecto + primera tarea, y deja el proyecto listo. Después sumás más tareas con el campo "Nueva tarea…" al pie de cada proyecto. No quedan proyectos vacíos.
- El board muestra la jerarquía Cliente → Proyectos → Tareas. Cada cliente es colapsable. Seleccionar un cliente sin proyectos muestra un atajo para crear el primero.
- Cada proyecto (dentro de su cliente) conserva sus controles: colapsar/expandir, renombrar inline (click en el nombre), color + emoji (ícono de paleta), mover a otro cliente y eliminar (menú `⋯`).
- Archivar proyectos: botón de archivar en cada proyecto para retirarlo a medida que se completa (archiva todas sus tareas); en la vista Archivo se reactiva.
- Drag & drop para reordenar tareas dentro de cada proyecto.
- Status con barra de color a la izquierda de cada fila (pending=rojo, ongoing=verde, waiting=azul, done=gris).
- Due date con badges relativos ("Hoy", "Mañana", "d MMM") y snooze rápido (+1d, próx. lunes, +1sem, +2sem).
- Archivo (`A`): tareas/proyectos archivados se ocultan; el cliente sólo ve activos.
- Búsqueda full-text (`/`).
- Export CSV.
- Atajos: `N` nuevo proyecto · `/` buscar · `A` toggle archivo.

Los boards de clientas (Mely, Yiss, Mafe) comparten estas features (con "Grupos" en lugar de "Clientes"); no incluyen el botón "Compartir" porque el board ya es el link público.

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
