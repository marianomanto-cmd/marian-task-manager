# Agency Board

App interna de gestión para Sangría Agency. Cubre tareas del equipo, proyectos con clientes, timelines/Gantt y boards públicos por clienta.

---

## Rutas

| Ruta | Sección | Acceso |
|---|---|---|
| `/tasks` | Mi board | Equipo logueado |
| `/projects` | Proyectos | Equipo logueado (sólo Mariano edita) |
| `/timeliner` | Timeliner | Equipo logueado |
| `/p/<token>` | Vista compartida | Pública (sin login) |
| `/boardmely` | Board – Mely | Público (sin login) |
| `/boardyiss` | Board – Yiss | Público (sin login) |
| `/boardmafe` | Board – Mafe | Público (sin login) |
| `/boardnadine` | Board – Nadine | Público (sin login) |
| `/login` | Login | Google OAuth |

---

## Shell de la aplicación

- **Sidebar colapsable**: botón en el header (`md:` en adelante). La preferencia se guarda en `localStorage` (`agencyboard:sidebar-collapsed`) y se sincroniza entre pestañas con `useSyncExternalStore` + `storage` event. En mobile usa `BottomNav` en lugar de sidebar.
- **Header**: título de la app, relojes de zonas horarias (PTY, MIA, ARG, ESP), toggle del sidebar, avatar de usuario con menú (cerrar sesión).
- **Navegación**: Mi board · Proyectos · Timeliner (sin restricción de admin — todo el equipo ve las tres pestañas).
- **Reducción de movimiento**: se respeta `prefers-reduced-motion`; las transiciones CSS se anulan globalmente si el sistema lo pide.

---

## Mi board (`/tasks`)

Board de tareas internas del equipo. Cada persona puede ver y administrar las suyas; cualquiera puede ver las de otro.

### Vistas
- **Lista**: tabla con una fila por tarea. Por defecto muestra las asignadas al usuario actual.
- **Kanban**: columnas por estado (`Por hacer`, `En curso`, `Revisión`, `Listo`). En kanban los filtros de estado se ignoran — las columnas son el filtro.

### Filtros en toolbar (dropdowns compactos)
- **Sólo mías**: chip rápido que acota a las tareas propias del usuario.
- **Asignado**: multi-select — muestra las tareas de cualquier combinación de miembros.
- **Estado**: multi-select — `Por hacer / En curso / Revisión / Listo`. Solo visible en vista lista.
- **Prioridad**: multi-select — `Baja / Media / Alta`.
- **Archivadas**: toggle — cambia entre activo y archivo (tareas cerradas hace más de 7 días).
- Cada botón de filtro muestra un badge numérico cuando la selección está acotada (sin llenar todo el espacio).

### Modelo de datos — Task
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK auth.users |
| `project_id` | uuid \| null | FK projects (no usado aún) |
| `title` | string | |
| `notes` | string \| null | |
| `status` | `todo \| in_progress \| review \| done` | |
| `priority` | `low \| medium \| high` | |
| `due_date` | YYYY-MM-DD \| null | |
| `completed_at` | timestamp \| null | |
| `link` | string \| null | URL libre (Drive, Notion, Figma…) |
| `assignees` | string[] | Claves de miembros del equipo |
| `notified` | string[] | Miembros que siguen la tarea sin ser dueños |

### Acceso
- **RLS**: `is_sangria_member()` para lectura, `auth.uid() = user_id` para escritura.
- Cualquier miembro puede ver todas las tareas, pero sólo puede crear/editar las propias.

---

## Proyectos (`/projects`)

Board de pendientes que Mariano comparte con clientes. Jerarquía: **Cliente → Proyecto → Tarea**.

### Acceso
- **Todo el equipo puede ver** el board (ya no es exclusivo del admin).
- **Solo Mariano (admin) puede crear, editar, archivar o eliminar** proyectos y tareas.
- `canEdit` se determina por `ADMIN_EMAIL` en el servidor.

### Filtros en toolbar
- **Cliente** (single-select): `Todos` / nombre de cliente / `Sin cliente`. Cuando se selecciona un cliente, el label del botón lo muestra (`Cliente: Acme`).
- **Status** (multi-select): `Pending / Ongoing / Waiting / Done`.
- **Categoría** (multi-select): `MP / Tráfico / Creativo / Reporting / Otros`.
- **Búsqueda full-text**: campo en el toolbar, atajo de teclado `/`.

### Gestión de clientes (solo admin)
- Integrada como footer dentro del dropdown "Cliente".
- Agregar / eliminar clientes sin abrir otro menú.
- Eliminar un cliente deja sus proyectos como "Sin cliente".

### Jerarquía y features
- El board muestra clientes colapsables; dentro de cada uno, sus proyectos; dentro de cada proyecto, sus tareas.
- Seleccionar un cliente sin proyectos muestra un atajo para crear el primero.
- **Crear proyecto** (`N` o botón `+ Nuevo proyecto`): pide cliente + nombre + primera tarea → no quedan proyectos vacíos.
- **Agregar tarea**: campo "Nueva tarea…" al pie de cada proyecto.
- Cada proyecto tiene controles: colapsar/expandir, renombrar inline (click en el nombre), color + emoji (paleta de 10 colores), mover a otro cliente, archivar, eliminar.
- **Archivar proyecto**: retira el proyecto y todas sus tareas a la vista Archivo; se puede reactivar.
- **Drag & drop**: reordenar tareas dentro del mismo proyecto (dnd-kit).
- **Status bar**: franja de color a la izquierda de cada fila — pending=rojo, ongoing=verde, waiting=azul, done=gris.
- **Due date**: badges relativos ("Hoy", "Mañana", "d MMM") con snooze rápido (+1 día, próximo lunes, +1 sem, +2 sem).
- **Export CSV**: botón en el toolbar.
- **Vista compartida** (`/p/<token>`): link público de solo lectura para clientes. Se genera / rota / revoca desde el botón "Compartir".

### Atajos de teclado
| Tecla | Acción |
|---|---|
| `N` | Nuevo proyecto |
| `/` | Foco en búsqueda |
| `A` | Toggle archivo |

### Modelo de datos — ProjectItem
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK auth.users |
| `project` | string | Nombre del proyecto |
| `title` | string | |
| `description` | string \| null | |
| `category` | `mp \| trafico \| creativo \| reporting \| otros` | |
| `status` | `pending \| ongoing \| waiting \| done` | |
| `due_date` | YYYY-MM-DD \| null | |
| `link` | string \| null | |
| `position` | number | Para drag & drop |
| `archived_at` | timestamp \| null | |

### Colores de proyectos
`slate · sky · emerald · amber · rose · violet · fuchsia · teal · indigo · orange`

---

## Timeliner (`/timeliner`)

Creador de timelines / Gantt para el equipo. Visible y editable por cualquier miembro logueado.

### Features
- Múltiples timelines (pestañas).
- Tareas con duración, hitos, owners (lista del equipo).
- Drag para mover barras; estirar extremos para cambiar duración.
- Fines de semana y feriados por país (`AR / PA / US / ES`) con toggle on/off.
- Export a Excel (`.xlsx` con grilla coloreada).
- Grupos dentro de cada timeline (migración `0025_timeline_groups.sql`).

---

## Boards de clientas

Copias independientes del board de Proyectos, una por clienta externa. Son **públicos y sin login** — se accede directo por el link. Edición completa sin restricciones de admin.

| URL | Clienta | Tablas en DB |
|---|---|---|
| `/boardmely` | Mely | `mely_*` |
| `/boardyiss` | Yiss | `yiss_*` |
| `/boardmafe` | Mafe | `mafe_*` |
| `/boardnadine` | Nadine | `nadine_*` |

- Usan **"Grupos"** en lugar de "Clientes".
- No incluyen el botón "Compartir" (el board ya es el link público).
- No aparecen en el menú del equipo autenticado.
- Comparten las mismas features de Proyectos: filtros, drag & drop, due date, snooze, archive, búsqueda.

---

## Vista compartida (`/p/[token]`)

Link público de solo lectura para clientes del board de Proyectos. El token se genera / rota / revoca desde el botón "Compartir" en la vista de Proyectos. No requiere login.

---

## Equipo

| Key | Nombre | Email |
|---|---|---|
| `sofi` | Sofi | media@sangria.agency |
| `andre` | Andre | andreyna.peraza@sangria.agency |
| `dave` | Dave | david.lopez@sangria.agency |
| `chelo` | Chelo | marcelo.boasso@sangria.agency |
| `herman` | Herman | herman.grabosky@sangria.agency |
| `sergio` | Sergio | sergio.barrientos@sangria.agency |
| `ine` | Ine | ines.echavarria@sangria.agency |
| `axel` | Axel | axel.nieves@sangria.agency |
| `marian` | Marian | mariano.mantovani@sangria.agency |

El `key` es un slug estable almacenado en `task_assignees.member_key`. Renombrar a una persona en `members.ts` no rompe datos existentes.

---

## Control de acceso

| Contexto | Restricción |
|---|---|
| Login | Google OAuth, dominio `@sangria.agency` únicamente |
| Admin | Determinado por `ADMIN_EMAIL` env var (Mariano) |
| Leer tareas | `is_sangria_member()` RLS (cualquier miembro) |
| Crear/editar tareas | `auth.uid() = user_id` (dueño de la tarea) |
| Leer proyectos | `is_sangria_member()` RLS |
| Editar proyectos | Solo admin en el servidor (`canEdit` flag) |
| Boards de clientas | Públicos, sin auth, RLS per-tabla |
| Vista compartida | Token opaco, público, solo lectura |
| Timeliner | Cualquier miembro logueado |

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **shadcn/ui**
- **Supabase Auth** (Google OAuth) + **Postgres** con RLS
- **TanStack Query** para fetching client-side con server actions
- **dnd-kit** para drag & drop
- **Zod** para validación de schemas
- **date-fns** para fechas
- **xlsx** para export a Excel (Timeliner)

---

## Zonas horarias

La app muestra relojes en el header para: `PTY` (Panamá), `MIA` (New York), `ARG` (Buenos Aires), `ESP` (Madrid).

---

## Migraciones

Aplicar en orden desde Supabase → SQL Editor o `supabase db push`:

| Archivo | Contenido |
|---|---|
| `0005_ooo_entries.sql` | Entradas OOO |
| `0006_holidays.sql` | Feriados por país |
| `0007_tasks.sql` | Tabla `tasks` base |
| `0008_emails.sql` | Emails |
| `0009_email_ai.sql` | AI sobre emails |
| `0010_team_collab.sql` | Colaboración del equipo |
| `0011_activity_emails.sql` | Emails de actividad |
| `0012_email_read_state.sql` | Estado de lectura de emails |
| `0013_saved_filters_and_activity_seen.sql` | Filtros guardados |
| `0014_tasks_link.sql` | Campo `link` en tasks |
| `0015_task_notified.sql` | Campo `notified` en tasks |
| `0016_task_images.sql` | Imágenes en tasks |
| `0017_project_items.sql` | Tabla `project_items` |
| `0018_remove_legacy_features.sql` | Limpieza de features viejas |
| `0019_projects_pro.sql` | Mejoras al board de Proyectos |
| `0020_clients.sql` | Tabla `clients` |
| `0021_mely_board.sql` | Board de Mely (tablas `mely_*`) |
| `0022_yiss_board.sql` | Board de Yiss (tablas `yiss_*`) |
| `0023_mafe_board.sql` | Board de Mafe (tablas `mafe_*`) |
| `0024_timeliner.sql` | Timeliner (usa tabla `holidays`) |
| `0025_timeline_groups.sql` | Grupos en Timeliner |
| `0026_nadine_board.sql` | Board de Nadine (tablas `nadine_*`) |

---

## Setup

1. `npm install`
2. Crear `.env.local` con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ADMIN_EMAIL=mariano.mantovani@sangria.agency
   ```
3. En Supabase: aplicar todas las migraciones de `supabase/migrations/` en orden.
4. **Authentication → URL Configuration → Redirect URLs**: agregar `http://localhost:3000/auth/callback` y el dominio de producción.
5. **Authentication → Providers → Google**: Client ID + Secret. No hace falta agregar scopes extra.
6. `npm run dev`

---

## Scripts

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor local (`localhost:3000`) |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

---

## Estructura de componentes clave

```
app/
  (app)/
    layout.tsx          — AppShell (sidebar + header + bottom nav)
    tasks/page.tsx      — Mi board
    projects/page.tsx   — Proyectos
    timeliner/page.tsx  — Timeliner
  (auth)/login/         — Login Google
  (public)/
    boardmely/          — Board Mely
    boardyiss/          — Board Yiss
    boardmafe/          — Board Mafe
    boardnadine/        — Board Nadine
    p/[token]/          — Vista compartida

components/
  shell/
    app-shell.tsx       — Estado sidebar (useSyncExternalStore + localStorage)
    sidebar.tsx         — Sidebar colapsable (w-56 ↔ w-16)
    header.tsx          — Header con toggle sidebar y relojes
    bottom-nav.tsx      — Navegación mobile
    filter-menu.tsx     — FilterMenu (multi) + SingleFilterMenu (single)
    nav-items.ts        — Definición de rutas de navegación
  tasks/
    task-row.tsx        — Fila de tarea en vista lista
    task-form.tsx       — Form crear/editar tarea
    kanban-board.tsx    — Vista Kanban
    use-tasks.ts        — Hook TanStack Query para tareas
  projects/
    projects-board.tsx  — Board de Proyectos
  timeliner/
    timeliner-board.tsx — Board Timeliner / Gantt

lib/
  tasks/types.ts        — TaskStatus, TaskPriority, Task
  projects/types.ts     — ProjectItem, ProjectMeta, Client, colores
  team/members.ts       — TEAM_MEMBERS, getMemberByKey/Email
  timezones.ts          — PTY, MIA, ARG, ESP
  supabase/
    client.ts           — Cliente Supabase browser
    server.ts           — Cliente Supabase server (cookies)
    proxy.ts            — Middleware auth proxy
```
