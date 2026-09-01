# Agency Board

App interna de la agencia. El shell tiene una **barra lateral colapsable** (botón en el header, preferencia recordada por navegador) y el contenido usa todo el ancho disponible. Pestañas:

- **Mi board** (`/tasks`): tareas asignables a cualquier miembro del equipo. Cada uno usa su propio board si quiere (filtros "Sólo mías"). Visible para todo el equipo, sin notificaciones externas.
- **Proyectos** (`/projects`): board de pendientes que Mariano comparte con clientes. Organizado por cliente → proyecto → tareas, con categoría, status, due date, link y nota. Creación top-down: elegís un cliente, creás sus proyectos, y dentro de cada proyecto cargás las tareas. **Sólo Mariano edita; lo ve y navega todo el equipo** (la pestaña ya no está restringida al admin).
- **Timeliner** (`/timeliner`): creador de timelines/Gantt para el equipo. Varios timelines (pestañas), tareas con duración, hitos, owners (lista del equipo), arrastrar para mover/estirar barras, **dependencias entre tareas**, fines de semana y feriados por país (AR/PA/US/ES) con toggle on/off, y export a Excel (.xlsx con grilla coloreada). Visible y editable por cualquier miembro logueado. Cada timeline tiene además su **link para el cliente** (ver abajo).
- **MASTER** (pestaña dentro de `/timeliner`): el planning de todos los timelines juntos, de hoy en adelante, con horizonte de 1, 2 o 3 meses. Cada proyecto es **una fila colapsada** con todo lo importante en una sola línea; se abre para leer los títulos y se hace click en el nombre para saltar al timeline. "Lo importante" son los hitos (siempre) más las tareas marcadas con ★.
- **Link de timeline** (`/t/<token>`): cada timeline del Timeliner se comparte con su propio link de **sólo lectura y sin login**. Muestra **ese timeline solamente** (el token se resuelve en la base, así que un link no puede llegar a otro timeline) y **se actualiza solo**: la página vuelve a pedir los datos cada 15 segundos mientras está a la vista, y al volver a la pestaña — el cliente puede dejarla abierta y ver los cambios del equipo sin recargar. Sale del botón "Compartir" del Timeliner, donde también se genera otro link (el anterior muere) o se deja de compartir. Las pestañas de timelines compartidos muestran un ícono de link.
- **Briefs** (`/briefs`): subís los PDF de los briefs de boosting ("Brief soporte PAGO en Redes Sociales") y Claude los lee —mira la página, así interpreta las casillas tildadas con X (objetivo, KPI, redes)— y arma una tabla lista para el equipo de medios: start/end date, mercados, objetivo, inversión, KPI, metas, link, target audience, redes y un resumen del background. Drag & drop (varios a la vez), edición por fila, y export con "Copiar tabla" (se pega en Sheets/Excel) o "Excel". Compartido por el equipo. Requiere `ANTHROPIC_API_KEY`; el modelo es configurable con `BRIEFS_MODEL` (default Haiku, el más barato).
- **Link por cliente** (`/copa`, `/cmi`, `/felix`, …): cada cliente de Proyectos tiene su propio link público. **Sin login: se abre con el link y listo.** Cada uno ve **sólo sus proyectos y tareas** — no ve los de los otros clientes (el filtro se aplica en la base, no en el navegador). Es de sólo lectura y no muestra archivadas. Trae filtros por **Status** y por **Área** (la categoría: MP, Tráfico, Creativo, Reporting, Otros); **por defecto las tareas `done` quedan ocultas** y se muestran tildando "Done" en el filtro. Un renglón avisa cuántas tareas están ocultas, con atajos para mostrar las done o volver a ver todo. Los links salen del botón "Compartir" en Proyectos, donde también se copian y se les cambia el nombre (`/copa` → `/copa-airlines`, lo que quieras).
- **Todos los clientes** (`/todos`): el board completo en un solo link público, con los clientes uno abajo del otro. Es para el equipo — no se lo pases a un cliente, porque muestra todo.
- **Vista compartida** (`/p/<token>`): el link viejo por token, de sólo lectura y con el board entero. Queda para los tokens ya repartidos; los links por cliente lo reemplazan. Se rota/revoca desde "Compartir".
- **Boards de clientas** — **Board - Mely** (`/boardmely`), **Board - Yiss** (`/boardyiss`), **Board - Mafe** (`/boardmafe`) y **Board - Nadine** (`/boardnadine`): copias independientes del board de Proyectos, una por clienta externa. Son **públicas y sin login** (se accede directo por el link), con edición completa. Usan "Grupos" en vez de "Clientes" y guardan sus datos en tablas aisladas (`mely_*` / `yiss_*` / `mafe_*` / `nadine_*`). No aparecen en el menú del equipo; sin sesión, la app manda a login (no ven `/projects` ni `/tasks`).

Login con Google (cuentas `@sangria.agency`). Sin integraciones con Gmail, Calendar, ni Slack.

> Los boards de clientas requieren aplicar las migraciones `supabase/migrations/0021_mely_board.sql`, `0022_yiss_board.sql`, `0023_mafe_board.sql` y `0026_nadine_board.sql`.
>
> Timeliner requiere aplicar `supabase/migrations/0024_timeliner.sql` (usa la tabla `holidays` ya existente); los links de timeline, `0029_timeline_public_links.sql`; las dependencias, la plantilla y el MASTER, `0030_timeline_dependencies.sql`.
>
> Briefs requiere aplicar `supabase/migrations/0027_briefs.sql` y configurar `ANTHROPIC_API_KEY`.
>
> Los links por cliente requieren `supabase/migrations/0028_client_public_links.sql` (agrega `clients.slug` y las funciones públicas de lectura).

### Timeliner: features clave

- **Timeline nuevo con el proyecto base**: el botón `+` crea el timeline ya cargado con las 22 tareas e hitos de un proyecto estándar (los mismos de "Colombia Positioning", en el mismo orden y con las mismas distancias entre sí) y con su cadena de dependencias armada. Sólo queda estirar, acortar y mover las barras con el mouse. En el mismo popover se elige la fecha de arranque (por defecto el lunes que viene, así ninguna tarea cambia de día de la semana) y se puede apagar la plantilla para empezar en blanco.
- **Dependencias arrastrando, sin modal**: al pasar el mouse por una barra aparecen dos puntitos, uno en cada punta. Se tira de uno hasta otra tarea o hito y quedan vinculados; la punta de la que salís y la que tocás definen el tipo (`FS` fin→inicio, `SS` inicio→inicio, `FF` fin→fin, `SF` inicio→fin).
- **Todo se reacomoda solo**: al mover o estirar una barra, todo lo que cuelga de ella se corre en el mismo gesto y se guarda de una sola vez. Cada vínculo conserva el aire con el que fue dibujado: una cadena pegada sigue pegada, una con tres días de margen mantiene los tres. Mover una tarea hacia atrás también arrastra a las que dependen de ella, hasta donde el resto de sus predecesoras lo permita. Los círculos entre tareas se rechazan al crearlos.
- **Zoom** de la escala (día / semana / mes) para pasar de una semana a un trimestre sin salir del timeline.
- **★ para el MASTER**: la estrella de cada fila (o el switch del editor) marca una tarea como importante y la manda a la pestaña MASTER. Los hitos ya van solos.
- El link para el cliente (`/t/<token>`) muestra las mismas flechas, en sólo lectura.
- El export a Excel suma una columna **"Depende de"** con las predecesoras de cada tarea, su tipo y su margen.

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
- Links por cliente: cada cliente nuevo recibe su link automáticamente (la primera palabra del nombre: "Copa Airlines" → `/copa`). Editable desde "Compartir". Como viven en la raíz del dominio, no pueden llamarse igual que una ruta de la app (`tasks`, `projects`, `briefs`, `timeliner`, `todos`, `login`, `p`, …); la app rechaza esos nombres y avisa.

Los boards de clientas (Mely, Yiss, Mafe) comparten estas features (con "Grupos" en lugar de "Clientes"); no incluyen el botón "Compartir" porque el board ya es el link público.

### Timeliner: cómo está armado

El Gantt corre sobre **[SVAR React Gantt](https://svar.dev/react/gantt/)** (`@svar-ui/react-gantt`, MIT). Ojo con el paquete: el que recomiendan casi todos los blogs es `wx-react-gantt`, que es **GPLv3 y sólo React 18**; el bueno para esto es el scope `@svar-ui/*` v2, MIT y `react >= 18`.

Cuatro cosas que conviene saber antes de tocarlo, porque cada una costó encontrarla:

1. **Los eventos son `on` + PascalCase** (`onUpdateTask`, `onAddLink`, …), aunque los tipos publicados digan otra cosa. Como el componente declara un índice `on${string}`, un nombre mal escrito compila igual y **nunca se dispara**. Si un handler "no anda", es lo primero a mirar.
2. **El `end` de SVAR es exclusivo** y el nuestro inclusivo. Toda la conversión vive en `lib/timeliner/svar-adapter.ts`, junto con la traducción `FS/SS/FF/SF` ↔ `e2s/s2s/e2e/s2e` y los grupos ↔ *summary tasks*.
3. **El auto-scheduling de SVAR no sirve acá**: con `schedule: {auto:true}` hace cumplir un vínculo *rechazando* el arrastre — tirás la barra y vuelve sola. Queda apagado a propósito, y la cascada la calcula `lib/timeliner/schedule.ts` (preserva el margen de cada vínculo) y se le devuelve al chart con `api.exec`.
4. **SVAR se re-inicializa cuando cambia la identidad de sus props de config.** Por eso el componente monta con los datos una vez y lee el resto por refs: si no, un refetch en segundo plano te resetea el plan mientras arrastrás.

Además está montado **sólo en cliente** (`ssr: false`): SVAR usa `useSyncExternalStore` sin snapshot de SSR, así que server-renderizarlo rompe la hidratación. Y sus temas linkean un font de íconos desde `cdn.svar.dev`; el chart usa tres glifos nada más, así que se dibujan localmente en `globals.css` y el `<link>` se saca, para no pegarle a un CDN de terceros en cada carga.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- [`@svar-ui/react-gantt`](https://svar.dev/react/gantt/) (MIT) para el Gantt del Timeliner
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
