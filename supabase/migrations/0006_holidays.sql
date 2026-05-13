-- Public holidays for AR / PA / US / ES.
-- 2026 seed below derived from official fixed dates + deterministic rules
-- (Computus for Easter, "nth-Monday" rule for US). Argentina's
-- decree-movable Monday-anchored holidays are listed on their nominal
-- date; if a 2026 decree relocates them, edit the rows manually.
-- Source intent: date.nager.at — fetch was unavailable from the build env.

create table public.holidays (
  id serial primary key,
  country text not null check (country in ('AR','PA','US','ES')),
  date date not null,
  name text not null,
  unique (country, date)
);

create index holidays_date_idx on public.holidays (date);
create index holidays_country_date_idx on public.holidays (country, date);

alter table public.holidays enable row level security;

create policy "holidays read"
  on public.holidays
  for select
  using (true);

-- ─── Argentina ─────────────────────────────────────────────────────────
insert into public.holidays (country, date, name) values
  ('AR', '2026-01-01', 'Año Nuevo'),
  ('AR', '2026-02-16', 'Carnaval'),
  ('AR', '2026-02-17', 'Carnaval'),
  ('AR', '2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia'),
  ('AR', '2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas'),
  ('AR', '2026-04-03', 'Viernes Santo'),
  ('AR', '2026-05-01', 'Día del Trabajador'),
  ('AR', '2026-05-25', 'Día de la Revolución de Mayo'),
  ('AR', '2026-06-17', 'Paso a la Inmortalidad del Gral. Güemes'),
  ('AR', '2026-06-20', 'Paso a la Inmortalidad del Gral. Belgrano'),
  ('AR', '2026-07-09', 'Día de la Independencia'),
  ('AR', '2026-08-17', 'Paso a la Inmortalidad del Gral. San Martín'),
  ('AR', '2026-10-12', 'Día del Respeto a la Diversidad Cultural'),
  ('AR', '2026-11-20', 'Día de la Soberanía Nacional'),
  ('AR', '2026-12-08', 'Inmaculada Concepción de María'),
  ('AR', '2026-12-25', 'Navidad');

-- ─── Panamá ─────────────────────────────────────────────────────────
insert into public.holidays (country, date, name) values
  ('PA', '2026-01-01', 'Año Nuevo'),
  ('PA', '2026-01-09', 'Día de los Mártires'),
  ('PA', '2026-02-16', 'Lunes de Carnaval'),
  ('PA', '2026-02-17', 'Martes de Carnaval'),
  ('PA', '2026-04-03', 'Viernes Santo'),
  ('PA', '2026-05-01', 'Día del Trabajador'),
  ('PA', '2026-11-03', 'Separación de Panamá de Colombia'),
  ('PA', '2026-11-04', 'Día de los Símbolos Patrios'),
  ('PA', '2026-11-05', 'Consolidación del Movimiento Separatista'),
  ('PA', '2026-11-10', 'Primer Grito de Independencia'),
  ('PA', '2026-11-28', 'Independencia de España'),
  ('PA', '2026-12-08', 'Día de las Madres'),
  ('PA', '2026-12-20', 'Día Nacional de Duelo'),
  ('PA', '2026-12-25', 'Navidad');

-- ─── United States ───────────────────────────────────────────────────
insert into public.holidays (country, date, name) values
  ('US', '2026-01-01', 'New Year''s Day'),
  ('US', '2026-01-19', 'Martin Luther King, Jr. Day'),
  ('US', '2026-02-16', 'Presidents'' Day'),
  ('US', '2026-05-25', 'Memorial Day'),
  ('US', '2026-06-19', 'Juneteenth National Independence Day'),
  ('US', '2026-07-04', 'Independence Day'),
  ('US', '2026-09-07', 'Labor Day'),
  ('US', '2026-10-12', 'Columbus Day'),
  ('US', '2026-11-11', 'Veterans Day'),
  ('US', '2026-11-26', 'Thanksgiving Day'),
  ('US', '2026-12-25', 'Christmas Day');

-- ─── España (national) ────────────────────────────────────────────────
insert into public.holidays (country, date, name) values
  ('ES', '2026-01-01', 'Año Nuevo'),
  ('ES', '2026-01-06', 'Epifanía del Señor'),
  ('ES', '2026-04-03', 'Viernes Santo'),
  ('ES', '2026-05-01', 'Fiesta del Trabajo'),
  ('ES', '2026-08-15', 'Asunción de la Virgen'),
  ('ES', '2026-10-12', 'Fiesta Nacional de España'),
  ('ES', '2026-11-01', 'Todos los Santos'),
  ('ES', '2026-12-06', 'Día de la Constitución Española'),
  ('ES', '2026-12-08', 'Inmaculada Concepción'),
  ('ES', '2026-12-25', 'Natividad del Señor');
