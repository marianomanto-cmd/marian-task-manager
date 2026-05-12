# Agency Board — Especificación técnica

Documento de handoff para Claude Code. Pegalo en el prompt inicial o ponelo como `SPEC.md` en la raíz del repo y referencialo.

---

## 0. Filosofía de desarrollo

- **Incremental por fases**: cada fase deja la app deployada en Vercel y usable. No se arranca la siguiente hasta confirmar que la anterior funciona en producción.
- **Git con branches por fase**: `fase-0-shell`, `fase-1-tasks`, etc. Merge a `main` solo cuando la fase está validada. Si algo se rompe a mitad de una fase, se vuelve al último commit estable de esa branch.
- **Una migración de Supabase por fase**, numerada. Nunca editar migraciones ya aplicadas — agregar una nueva.
- **No optimización prematura**: empezar simple, refactorizar cuando duela.
- **Cero `any` en TypeScript**, cero `console.log` en commits. Usar `lint` como gate de PR.

---

## 1. Visión y alcance

**Producto**: web app para una agencia de publicidad que centraliza tareas pendientes y procesa mails entrantes con IA para categorizarlos, resumirlos y convertirlos en tareas.

**Usuario primario**: dueño/operador de la agencia (Mariano). v1 single-user. Multi-usuario queda para v2.

**Lo que sí entra en v1**:
- Auth con Google OAuth (mismo flujo da acceso a Gmail)
- Bandeja AI: mails sincronizados manualmente, categorizados y resumidos por Claude, con código de campaña detectado
- Tareas: CRUD completo, lista + kanban, status, fecha, notas, prioridad
- Calendario mensual con feriados de Panamá, Miami (US), Argentina, España
- Relojes de las 4 zonas horarias en el header (desktop) o tira compacta (mobile)
- Proyectos como entidad: se crean automáticamente al detectar código de campaña nuevo
- Descarga de adjuntos (no integración con Drive)
- Botón manual de sincronización con Gmail
- Toggle claro/oscuro con persistencia
- Mobile-first

**Lo que NO entra en v1** (registrar como backlog):
- Guardar en Drive (descartado por el usuario)
- Cron de sync automático (todo manual con botón)
- Notificaciones push
- Multi-usuario / partners
- Insights tab con charts (mover a fase posterior)
- Briefing diario IA
- Sugerencias de respuesta IA
- Realtime cross-device

---

## 2. Stack

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Actions, deploy directo a Vercel |
| UI | shadcn/ui + Tailwind | Componentes copy-paste, dark mode out of the box |
| Theming | `next-themes` | Toggle sistema/claro/oscuro |
| Iconos | `lucide-react` | Viene con shadcn |
| DB + Auth + Storage | Supabase (Postgres) | Auth con Google OAuth de fábrica |
| ORM/Queries | Supabase JS client + tipos generados | `supabase gen types typescript` |
| Validación | Zod | Schemas compartidos cliente/server |
| Cliente data | TanStack Query | Cache, invalidación, optimistic updates |
| IA | Anthropic SDK directo desde server actions | Modelo: `claude-haiku-4-5-20251001` |
| Gmail | `googleapis` npm package | Wrapper oficial |
| Drag & drop (fase Kanban) | `@dnd-kit/core` | Estándar moderno |
| Command palette (fase polish) | `cmdk` | Vercel-mantained |
| Mobile sheets | `vaul` (viene con shadcn `Drawer`) | Bottom sheets nativos |
| Fechas/zonas horarias | `date-fns` + `date-fns-tz` | Light, tree-shakeable |

**Hosting**: Vercel (frontend + server actions + API routes). Supabase para todo el backend persistente. Sin servidores adicionales.

---

## 3. Arquitectura general

```
Browser (Next.js client)
   ↓
Next.js Server Actions / API Routes (en Vercel)
   ↓                              ↓
Supabase (Auth + DB + RLS)    Anthropic API + Gmail API
```

**Decisiones clave**:
- Supabase Auth con Google OAuth provider. El `provider_token` del proveedor (Google) lo guardamos cifrado en Supabase para llamar a Gmail API.
- Toda escritura va por server actions, nunca cliente → Supabase directo. Esto centraliza validación y permite logging.
- Las lecturas pueden ir por client SDK con RLS protegiendo. Más rápido para UI reactiva.
- El procesamiento con Claude es **siempre server-side**, nunca expuesto al cliente.

---

## 4. Modelo de datos

Migración inicial. Crear en `supabase/migrations/0001_init.sql`:

```sql
-- Perfil extendido del usuario
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gmail_history_id text,             -- cursor de Gmail para sync incremental
  last_synced_at timestamptz,
  gmail_refresh_token text,          -- cifrado por extensión vault
  theme_preference text default 'system' check (theme_preference in ('system','light','dark')),
  created_at timestamptz default now()
);

-- Clientes de la agencia
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  country text check (country in ('AR','PA','US','ES','OTHER')),
  timezone text,
  notes text,
  created_at timestamptz default now()
);

-- Proyectos/campañas (se autocrean al detectar código)
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,                       -- ej: 'CCL-2026-Q2'
  name text,
  client_id uuid references public.clients(id),
  status text default 'active' check (status in ('active','paused','archived','done')),
  created_at timestamptz default now(),
  unique (user_id, code)
);

-- Mails sincronizados desde Gmail
create table public.emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,           -- id de Gmail
  gmail_thread_id text not null,
  project_id uuid references public.projects(id),
  sender_name text,
  sender_email text,
  subject text,
  snippet text,                             -- preview de Gmail
  body_preview text,                        -- primeros ~1500 chars (para IA y UI)
  received_at timestamptz not null,
  has_attachments boolean default false,
  attachments_meta jsonb,                   -- [{id, filename, mime, size}]
  is_archived boolean default false,
  created_at timestamptz default now(),
  unique (user_id, gmail_message_id)        -- ANTI-DUPLICADO CLAVE
);

-- Análisis IA (separado para garantizar no re-procesar)
create table public.email_ai (
  email_id uuid primary key references public.emails(id) on delete cascade,
  category text check (category in ('URGENTE','CLIENTE','PROVEEDOR','INTERNO','INFORMATIVO','OTROS')),
  summary text,
  priority int check (priority between 0 and 100),
  campaign_code text,                       -- texto crudo que detectó la IA
  detected_deadline timestamptz,
  suggested_action text check (suggested_action in ('responder','crear_tarea','archivar','derivar')),
  requires_response boolean,
  model_version text not null,              -- ej: 'claude-haiku-4-5-20251001'
  prompt_version text not null,             -- ej: 'v1.0' para reprocesar si cambia
  tokens_input int,
  tokens_output int,
  processed_at timestamptz default now()
);

-- Tareas
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id),
  email_id uuid references public.emails(id),
  title text not null,
  notes text,
  status text default 'todo' check (status in ('todo','in_progress','review','done')),
  priority text default 'medium' check (priority in ('low','medium','high')),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Feriados precargados
create table public.holidays (
  id serial primary key,
  country text not null check (country in ('AR','PA','US','ES')),
  date date not null,
  name text not null,
  unique (country, date)
);

-- Log de sincronizaciones (auditoría + control de costos)
create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz default now(),
  finished_at timestamptz,
  messages_fetched int default 0,
  messages_inserted int default 0,
  messages_processed_ai int default 0,
  messages_skipped_already_processed int default 0,
  total_tokens_input int default 0,
  total_tokens_output int default 0,
  estimated_cost_usd numeric(10,4) default 0,
  error text
);

-- Índices
create index emails_user_received_idx on emails(user_id, received_at desc);
create index emails_thread_idx on emails(gmail_thread_id);
create index tasks_user_status_idx on tasks(user_id, status);
create index tasks_due_idx on tasks(due_date) where due_date is not null;

-- Trigger para updated_at en tasks
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger tasks_updated_at before update on tasks
for each row execute function update_updated_at();
```

**RLS — aplicar a todas las tablas con `user_id`**:

```sql
alter table user_settings enable row level security;
alter table clients enable row level security;
alter table projects enable row level security;
alter table emails enable row level security;
alter table email_ai enable row level security;
alter table tasks enable row level security;
alter table sync_log enable row level security;

-- Patrón estándar para cada tabla con user_id directo:
create policy "own data" on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Para email_ai (no tiene user_id pero referencia emails):
create policy "own email_ai" on email_ai
  for all using (
    exists (select 1 from emails e where e.id = email_ai.email_id and e.user_id = auth.uid())
  );

-- holidays es público (read-only)
alter table holidays enable row level security;
create policy "holidays read" on holidays for select using (true);
```

---

## 5. Flujo de sincronización — anti-loop garantizado

Este es el flujo crítico. Lo escribimos así explícitamente para que **nunca se re-procesen mails ya analizados**.

### 5.1 Disparo

Solo manual. Botón **"Actualizar"** arriba a la derecha. Sin cron, sin polling.

**Rate limit cliente**: el botón se deshabilita 30 segundos tras un click exitoso.
**Rate limit server**: rechazar si `last_synced_at` fue hace menos de 20 segundos.

### 5.2 Pasos del sync (server action `syncGmail`)

```
1. Crear registro en sync_log con started_at = now()

2. Leer user_settings.gmail_history_id

3. Si gmail_history_id ES NULL (primera vez):
   - Llamar a gmail.users.messages.list(maxResults=50, q='-in:chats')
   - Obtener lista de message IDs
   ELSE:
   - Llamar a gmail.users.history.list(startHistoryId=gmail_history_id, historyTypes=['messageAdded'])
   - Extraer message IDs nuevos solamente

4. Para cada message ID:
   a. INSERT INTO emails (user_id, gmail_message_id, ...) ... ON CONFLICT (user_id, gmail_message_id) DO NOTHING
      → Si choca, NO se inserta. Idempotencia garantizada a nivel DB.
   b. Solo si efectivamente se insertó, llamar a gmail.users.messages.get(id, format='metadata' o 'full')
      Esto evita pegarle a Gmail por mails que ya tenemos.
   c. UPDATE emails SET sender, subject, snippet, body_preview, attachments_meta WHERE id = ...
   
   IMPORTANTE: hacer el insert vacío primero garantiza dedup incluso si dos syncs corren en paralelo.

5. Actualizar el nuevo historyId:
   UPDATE user_settings SET gmail_history_id = <último>, last_synced_at = now()

6. PROCESAR IA (paso separado, idempotente):
   SELECT e.id, e.sender_email, e.subject, e.snippet, e.body_preview
   FROM emails e
   LEFT JOIN email_ai ai ON ai.email_id = e.id
   WHERE e.user_id = $1 
     AND ai.email_id IS NULL              -- ← solo no procesados
   ORDER BY e.received_at DESC
   LIMIT 30                                -- ← tope duro por sync

7. Si hay > 0 mails sin procesar:
   - Batchear de a 10
   - Por cada batch: una llamada a Claude (ver sección 6)
   - INSERT INTO email_ai (...) con ON CONFLICT (email_id) DO NOTHING
   - Acumular tokens en sync_log

8. Cerrar sync_log con finished_at, contadores y estimated_cost_usd
```

### 5.3 Por qué esto no genera loops de tokens

Tres barreras en paralelo:

1. **A nivel Gmail**: usamos `history.list` con `historyId`. Gmail solo devuelve cambios posteriores al cursor. Si no llegaron mails nuevos → lista vacía → 0 llamadas a Claude.
2. **A nivel DB**: `UNIQUE (user_id, gmail_message_id)` en `emails`. Aunque alguien llame a `messages.list` directamente, `ON CONFLICT DO NOTHING` previene duplicados.
3. **A nivel IA**: la query del paso 6 es `LEFT JOIN ... WHERE ai.email_id IS NULL`. Un mail con análisis IA existente **nunca** vuelve a ese SELECT. Imposible reprocesar accidentalmente.

### 5.4 Si querés reprocesar a propósito

Caso real: cambiás el prompt y querés rehacer el análisis. Para esto existe `prompt_version`. Endpoint admin opcional (no en UI v1):

```sql
DELETE FROM email_ai WHERE prompt_version = 'v1.0';
-- siguiente sync los reprocesa con la nueva versión
```

---

## 6. Procesamiento con Claude — control de costos

### 6.1 Modelo

`claude-haiku-4-5-20251001`. Suficiente para clasificación estructurada. Sonnet es overkill.

### 6.2 Input por mail (mínimo necesario)

- `id` (uuid interno de la tabla `emails`)
- `from` (`sender_name <sender_email>`)
- `subject`
- `body_preview` (primeros 1500 chars del body, ya truncado)

**No mandar el body completo**. Si el campaign code está en el footer del mail, lo extraemos por regex local antes de mandar a Claude.

### 6.3 Prompt (versionado como `v1.0`)

```
Sos un asistente que clasifica mails entrantes de una agencia de publicidad para un task board.

Analizá CADA mail del array de input y devolvé un JSON array con un objeto por mail. Para cada uno:
- id: el id que te pasamos (string, exacto)
- category: uno de ["URGENTE","CLIENTE","PROVEEDOR","INTERNO","INFORMATIVO","OTROS"]
- summary: párrafo breve en español, máx 2 oraciones, qué pide o informa el mail
- priority: número entero 0-100. 70+ implica acción dentro de 24h. 90+ es crítico.
- campaign_code: si detectás un código de campaña o proyecto MENCIONADO TEXTUALMENTE en el mail (formato típico: LETRAS-NUMEROS, MARCA-AÑO, sigla.numero), devolvelo tal cual aparece. Si no hay código explícito, null. NO INVENTES códigos.
- detected_deadline: si el mail menciona una fecha límite concreta, devolvela en formato ISO 8601 (YYYY-MM-DD o con hora). Si no hay deadline explícito, null.
- suggested_action: uno de ["responder","crear_tarea","archivar","derivar"]
- requires_response: boolean

Reglas:
- Respondé SOLO con el JSON array, sin markdown fences, sin texto adicional, sin comentarios.
- Si el body está en otro idioma, igual devolvé summary en español.
- Newsletters/notificaciones automáticas → category="INFORMATIVO", priority<30, suggested_action="archivar".
- Mails sin contenido accionable claro → suggested_action="archivar".

Mails:
{ARRAY_JSON}
```

### 6.4 Batching

- 10 mails por request.
- Si llegan 35 mails nuevos → 4 requests (10+10+10+5).
- Cap duro: máximo 30 mails procesados por sync. Si quedan más sin procesar, mostrar en UI: "X mails pendientes — Actualizar de nuevo para procesarlos". Esto evita que un primer sync masivo dispare 100 llamadas a Claude.

### 6.5 Manejo de errores

- Si Claude devuelve JSON inválido: registrar en `sync_log.error`, NO insertar ningún `email_ai` de ese batch, dejar los mails como pendientes para el próximo sync (no se pierde dinero ni data).
- Reintentar 1 vez con backoff de 2s.
- Si falla 2 veces: skip y avisar en UI.

### 6.6 Visibilidad de costos

Mostrar en la página de bandeja, debajo del botón Actualizar:

```
Última sync: hace 3 min · 12 mails procesados · ~$0.03 USD
```

Y en una vista admin oculta (`/settings/usage`), tabla de `sync_log` con totales mensuales.

---

## 7. Estructura del proyecto

```
/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                  # shell: bottom nav mobile, sidebar desktop, header con relojes y toggle
│   │   ├── page.tsx                    # redirect a /inbox
│   │   ├── inbox/page.tsx
│   │   ├── tasks/page.tsx
│   │   ├── calendar/page.tsx
│   │   ├── projects/page.tsx
│   │   ├── projects/[id]/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── sync/route.ts               # POST: dispara sync de Gmail
│   │   ├── ai/route.ts                 # POST: procesa pendientes (interno)
│   │   └── attachments/[id]/route.ts   # GET: descarga adjunto vía Gmail API
│   ├── actions/
│   │   ├── tasks.ts                    # createTask, updateTask, deleteTask, convertEmailToTask
│   │   ├── emails.ts                   # archiveEmail
│   │   └── sync.ts                     # syncGmail
│   ├── globals.css
│   └── layout.tsx                      # root: ThemeProvider, TanStack Query, Toaster
├── components/
│   ├── ui/                             # shadcn components (button, card, sheet, drawer, etc.)
│   ├── shell/
│   │   ├── header.tsx                  # logo, sync-button, theme-toggle, avatar
│   │   ├── timezone-clocks.tsx
│   │   ├── sidebar.tsx                 # desktop
│   │   └── bottom-nav.tsx              # mobile
│   ├── inbox/
│   │   ├── email-card.tsx
│   │   ├── email-filters.tsx
│   │   ├── attachment-row.tsx
│   │   └── sync-button.tsx
│   ├── tasks/
│   │   ├── task-list.tsx
│   │   ├── task-kanban.tsx             # fase posterior
│   │   ├── task-form.tsx               # crear/editar (en Drawer mobile, Dialog desktop)
│   │   └── task-row.tsx
│   ├── calendar/
│   │   ├── month-grid.tsx
│   │   └── holiday-badge.tsx
│   └── theme-toggle.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # browser client
│   │   ├── server.ts                   # server client con cookies
│   │   └── types.ts                    # tipos generados
│   ├── gmail/
│   │   ├── client.ts                   # auth + factory
│   │   ├── sync.ts                     # listMessages, getMessage, parseAttachments
│   │   └── parser.ts                   # extracción de body, decode base64
│   ├── anthropic/
│   │   ├── client.ts
│   │   ├── prompts.ts                  # prompt v1.0 exportado
│   │   └── classify.ts                 # batchClassifyEmails(emails) → AIResult[]
│   ├── holidays/
│   │   └── seed.ts                     # carga inicial desde date.nager.at
│   ├── timezones.ts                    # helpers para PTY/MIA/ARG/ESP
│   └── utils.ts
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_holidays_seed.sql
│   │   └── ...
│   └── config.toml
├── .env.local
├── components.json                     # shadcn config
├── tailwind.config.ts
└── package.json
```

---

## 8. Seguridad

### 8.1 OAuth scopes (Google)

Mínimos necesarios:
- `openid email profile` (auth básica)
- `https://www.googleapis.com/auth/gmail.readonly` (leer mails y adjuntos)

**NO pedir**:
- `gmail.modify` (no archivamos en Gmail, solo en nuestra DB)
- Ningún scope de Drive
- `gmail.send`

### 8.2 Manejo del token de Gmail

Supabase Auth con Google OAuth devuelve `provider_token` y `provider_refresh_token` después del login. Guardar el `provider_refresh_token` en `user_settings.gmail_refresh_token` usando Supabase Vault (cifrado en reposo). El access token se regenera on-demand desde el refresh token.

### 8.3 RLS

Ver SQL en sección 4. Todas las tablas con `user_id` usan política `auth.uid() = user_id`. `holidays` es read-only público (no tiene data sensible).

### 8.4 Variables sensibles

`ANTHROPIC_API_KEY` solo en server. Nunca expuesta. Cualquier llamada a Claude pasa por server action o route handler.

---

## 9. Plan de implementación por fases

Cada fase termina con:
- Commits limpios en su branch
- Migración aplicada en Supabase
- Deploy en Vercel
- Checklist de verificación cumplida
- Merge a `main`

### Fase 0 — Foundation (shell vacío pero deployable)

**Branch**: `fase-0-shell`

- [ ] `npx create-next-app@latest` con TS, Tailwind, App Router
- [ ] `npx shadcn@latest init` con tema neutral
- [ ] Instalar: `next-themes lucide-react @tanstack/react-query zod date-fns date-fns-tz @supabase/ssr @supabase/supabase-js`
- [ ] Configurar Supabase project, copiar keys a `.env.local`
- [ ] Implementar `ThemeProvider` con `next-themes`
- [ ] Login con Google OAuth (botón único, redirect a `/inbox`)
- [ ] Layout principal con header (logo, relojes 4 zonas, theme toggle, avatar), sidebar desktop y bottom nav mobile
- [ ] Cuatro páginas vacías: `/inbox`, `/tasks`, `/calendar`, `/projects` con placeholder
- [ ] Deploy a Vercel, configurar variables de entorno
- [ ] Configurar redirect URLs de OAuth en Supabase y Google Cloud Console

**Verificación**:
- Login con Google funciona en producción
- Toggle claro/oscuro funciona y persiste
- Relojes muestran horas correctas en las 4 zonas
- Mobile y desktop se ven bien

### Fase 1 — Tareas (CRUD funcional aislado)

**Branch**: `fase-1-tasks`

- [ ] Migración 0001: tablas `tasks`, `user_settings`, `clients`, `projects`, `holidays`, RLS completo
- [ ] Generar tipos: `supabase gen types typescript --project-id ... > lib/supabase/types.ts`
- [ ] Server actions: `createTask`, `updateTask`, `deleteTask`, `toggleTaskStatus`
- [ ] Página `/tasks`: lista con filtros (status, prioridad), Drawer/Dialog para crear/editar
- [ ] Form con title, notes, status, priority, due_date
- [ ] Toast notifications para feedback de acciones
- [ ] Empty state cuando no hay tareas

**Verificación**:
- Crear/editar/borrar tareas persiste en Supabase
- RLS: con otro usuario no ves tareas ajenas (probar en SQL editor)
- Mobile: Drawer abre desde abajo, desktop: Dialog centrado

### Fase 2 — Sincronización Gmail sin IA

**Branch**: `fase-2-gmail-sync`

- [ ] Migración 0002: tablas `emails`, `sync_log` con UNIQUE constraint
- [ ] Agregar scope `gmail.readonly` al OAuth de Supabase
- [ ] Guardar `provider_refresh_token` en `user_settings.gmail_refresh_token` post-login
- [ ] `lib/gmail/client.ts`: factory que toma refresh_token y devuelve cliente autenticado
- [ ] `lib/gmail/sync.ts`: `fetchInitialMessages(50)` y `fetchHistoryDelta(historyId)`
- [ ] Server action `syncGmail()` implementando flujo de sección 5.2 pasos 1-5 (SIN IA todavía)
- [ ] Componente `SyncButton` con loading state y rate limit cliente de 30s
- [ ] Página `/inbox`: lista de emails (sin análisis IA aún), agrupados por día
- [ ] Componente `EmailCard` mostrando sender, subject, snippet, hora

**Verificación**:
- Primera sync trae últimos 50 mails y los muestra
- Segunda sync inmediata NO duplica nada (revisar count en DB)
- `gmail_history_id` queda guardado y avanza
- Rate limit funciona (botón deshabilitado 30s)

### Fase 3 — Procesamiento IA con anti-loop

**Branch**: `fase-3-ai-classification`

- [ ] Migración 0003: tabla `email_ai`
- [ ] `lib/anthropic/client.ts` y `prompts.ts` con prompt v1.0
- [ ] `lib/anthropic/classify.ts`: función `batchClassify(emails[], batchSize=10)` con retry y manejo de errores
- [ ] Extender `syncGmail()` con pasos 6-8 de sección 5.2
- [ ] UI: en `EmailCard` mostrar categoría (badge color), summary, código de campaña (badge violeta), botón "Crear tarea"
- [ ] Acción `convertEmailToTask(emailId)`: prefilla un task form con summary como title y suggested_action
- [ ] Mostrar costo estimado en footer del header después de sync

**Verificación**:
- Mails ya procesados NO se reanalizan en sync siguiente (verificar query del paso 6)
- Borrar manualmente un registro de `email_ai` y resyncar → ese mail vuelve a procesarse, los demás no
- Cap de 30 mails por sync se respeta
- JSON inválido de Claude no rompe el sync

### Fase 4 — Proyectos auto-detectados

**Branch**: `fase-4-projects`

- [ ] Lógica post-IA: si `campaign_code` no es null y no existe en `projects`, crear proyecto
- [ ] Linkear `emails.project_id` automáticamente
- [ ] Página `/projects`: grid con proyectos, count de mails y tareas, último movimiento
- [ ] Página `/projects/[id]`: tabs internas (Mails, Tareas, Notas), header con código y cliente

**Verificación**:
- Un mail con código nuevo crea proyecto
- Mails siguientes con el mismo código se enganchan automáticamente
- Filtro en bandeja por proyecto funciona

### Fase 5 — Calendario y feriados

**Branch**: `fase-5-calendar`

- [ ] Migración 0004: seed de feriados 2026 desde `date.nager.at` para AR, PA, US, ES
- [ ] Página `/calendar`: grid mensual con navegación mes anterior/siguiente
- [ ] Cada celda muestra: feriados (puntito de color por país, hover para nombre) y deadlines de tareas
- [ ] Tap en feriado → tooltip con nombre y país
- [ ] Tap en día → bottom sheet con mails recibidos ese día + tareas con deadline

**Verificación**:
- Feriados visibles con colores distintos por país
- Deadlines de tareas aparecen en el día correcto
- Navegación entre meses fluida

### Fase 6 — Descarga de adjuntos

**Branch**: `fase-6-attachments`

- [ ] Route handler `/api/attachments/[id]`: recibe email_id + attachment_id, llama a Gmail API, devuelve binary con `Content-Disposition`
- [ ] En `EmailCard`: si tiene adjuntos, lista expandible con ícono por mime type + botón descarga
- [ ] Touch targets mínimos 44px en mobile

**Verificación**:
- Descarga funciona en mobile y desktop
- Tipos comunes (pdf, xlsx, docx, png) tienen ícono correcto

### Fase 7 — Polish (cuando todo lo anterior es sólido)

**Branch**: `fase-7-polish`

- [ ] Vista Kanban en `/tasks` (toggle entre lista/kanban) con `@dnd-kit`
- [ ] Command palette ⌘K con `cmdk`
- [ ] FAB en mobile para quick capture
- [ ] Filtros guardables en bandeja
- [ ] Búsqueda full-text en mails (Postgres FTS)
- [ ] Página `/settings/usage` con totales mensuales de tokens y costos
- [ ] Mejora visual: micro-animaciones con Framer Motion en transiciones clave

---

## 10. Variables de entorno

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # solo server, para seed scripts
ANTHROPIC_API_KEY=
GOOGLE_OAUTH_CLIENT_ID=             # del Google Cloud Console
GOOGLE_OAUTH_CLIENT_SECRET=
```

En Vercel: setearlas todas en Project Settings → Environment Variables.

---

## 11. Comandos iniciales (fase 0)

```bash
npx create-next-app@latest agency-board --typescript --tailwind --app --no-src-dir
cd agency-board
npx shadcn@latest init
npx shadcn@latest add button card input textarea select badge avatar dialog drawer sheet dropdown-menu toast separator tabs
npm install next-themes lucide-react @tanstack/react-query zod date-fns date-fns-tz
npm install @supabase/ssr @supabase/supabase-js googleapis @anthropic-ai/sdk
npx supabase init
npx supabase link --project-ref <tu-project-ref>
```

---

## 12. Preguntas abiertas / decisiones pendientes

1. **¿Multi-account de Gmail?** v1 asume un solo Gmail por usuario. Si más adelante querés conectar varios, hay que refactorizar `user_settings` a una tabla `gmail_accounts`.
2. **¿Backup de mails completos?** Hoy guardamos solo preview. Si querés búsqueda full-body, hay que guardar body completo (más storage). Decidir en fase 7.
3. **¿Tareas recurrentes?** No están en v1. Si las necesitás, sumar tabla `task_templates` en fase 7.
4. **¿Notificaciones?** PWA + push lleva trabajo. Mientras tanto, mail diario con resumen sería más barato. Decidir post-v1.
5. **¿Modelo IA configurable?** Hoy fijo a Haiku 4.5. Si querés probar Sonnet para clasificación más fina, el field `model_version` ya lo soporta — solo cambiar el call en `lib/anthropic/classify.ts`.
6. **¿Multi-usuario / partners?** Esquema preparado con `user_id` pero RLS aísla todo. Para compartir entre Mariano y partners habrá que sumar tabla de `workspaces` y `memberships`.

---

## Reglas duras a respetar siempre

1. **Nunca borrar registros de `email_ai` automáticamente**. Solo manual desde SQL editor.
2. **Nunca cambiar `prompt_version` sin actualizar el string en código y dejar el viejo análisis intacto**.
3. **`syncGmail` siempre es idempotente**: correrlo dos veces seguidas con cero cambios externos debe resultar en cero inserts y cero llamadas a Claude.
4. **Toda escritura va por server actions con validación Zod**, nunca cliente → Supabase directo.
5. **Nunca exponer `ANTHROPIC_API_KEY` ni `provider_refresh_token` al cliente**.
6. **Cada fase merge a main solo cuando está verificada en producción**.
