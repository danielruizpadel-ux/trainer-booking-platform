-- 011 — Esquema compatible con el flujo actual en una base creada desde cero
--
-- Requiere 001 → 010 aplicadas en orden.
--
-- migrations/001 nunca se aplicó tal cual en la base desplegada (ver
-- CLAUDE.md y docs/DATABASE.md), pero una base NUEVA creada con 001 → 010 se
-- quedaba con restricciones que el código de hoy no cumple:
--
--   availability_slots
--     * class_type CHECK ('individual','group','semi-private'): la app y el
--       generador escriben 'private'. Lo desplegado usa una FK a
--       class_types(name) (private, group, academy).
--     * UNIQUE (trainer_id, session_date, start_time, class_type): lo
--       desplegado (y el modelo de ventanas de la 007) es UNIQUE
--       (trainer_id, session_date, start_time, end_time).
--   reservations
--     * sin client_name, client_email, client_phone ni price (todas las
--       reservas los escriben).
--     * client_id, session_time y class_type NOT NULL: ninguna reserva de
--       hoy los rellena (no existen en lo desplegado).
--     * availability_slot_id admite NULL (con ON DELETE SET NULL). Una
--       reserva sin ventana no tiene fecha (el trigger de la 008 la saca de
--       la ventana) y queda fuera de reservations_no_overlap. Pasa a NOT NULL,
--       como en lo desplegado, donde session_date sí admite NULL. (En la base
--       de la 001, session_date es NOT NULL y ya impedía borrar la ventana de
--       una reserva; esto lo hace explícito y rechaza datos heredados sin
--       ventana.)
--
-- Cada paso es CONDICIONAL: solo actúa si encuentra la forma de la 001. En la
-- base desplegada (ya con la forma de destino) no cambia nada; se puede
-- aplicar igualmente y deja un NOTICE por paso. No toca reservations_no_overlap
-- ni el trigger de fecha de la 008.
--
-- Si hay datos que impiden un paso (p. ej. reservas sin ventana), se para con
-- un mensaje claro: no se borra ni se inventa nada.
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres). Idempotente. En una
-- transacción.

begin;

do $$
declare
  c record;
  has_unique_range boolean;
  missing text;
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'reservations_no_overlap' and conrelid = 'public.reservations'::regclass
  ) then
    raise exception '011 requiere la 008: no existe la restricción reservations_no_overlap';
  end if;

  -- ─── availability_slots.class_type ───────────────────────────────────────
  -- Catálogo de tipos como en lo desplegado, con los valores ya usados.
  create table if not exists public.class_types (name text primary key);
  insert into public.class_types (name)
  values ('private'), ('group'), ('academy')
  on conflict (name) do nothing;
  insert into public.class_types (name)
  select distinct s.class_type from public.availability_slots s where s.class_type is not null
  on conflict (name) do nothing;

  -- CHECKs de class_type que no admiten 'private' (el de la 001) fuera.
  for c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.availability_slots'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%class_type%'
       and pg_get_constraintdef(oid) not ilike '%''private''%'
  loop
    raise notice '011: availability_slots: quito % (%)', c.conname, c.def;
    execute format('alter table public.availability_slots drop constraint %I', c.conname);
  end loop;

  -- FK a class_types si no hay ninguna sobre class_type.
  if not exists (
    select 1 from pg_constraint k
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where k.conrelid = 'public.availability_slots'::regclass and k.contype = 'f' and a.attname = 'class_type'
  ) then
    raise notice '011: availability_slots.class_type → FK a class_types(name)';
    alter table public.availability_slots
      add constraint availability_slots_class_type_fkey foreign key (class_type) references public.class_types (name);
  end if;
  alter table public.availability_slots alter column class_type set default 'private';

  -- status: la 003 ya admite 'blocked'; si no, algo falta antes.
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.availability_slots'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
       and pg_get_constraintdef(oid) not ilike '%''blocked''%'
  ) then
    raise exception '011: el CHECK de availability_slots.status no admite ''blocked''. ¿Falta la 003?';
  end if;

  -- ─── availability_slots: unique por rango ────────────────────────────────
  for c in
    select k.conname
      from pg_constraint k
     where k.conrelid = 'public.availability_slots'::regclass and k.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(k.conkey) as u(attnum)
              join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum)
           = array['class_type', 'session_date', 'start_time', 'trainer_id']
  loop
    raise notice '011: availability_slots: quito el unique de la 001 %', c.conname;
    execute format('alter table public.availability_slots drop constraint %I', c.conname);
  end loop;

  select exists (
    select 1 from pg_index i
     where i.indrelid = 'public.availability_slots'::regclass and i.indisunique and i.indpred is null
       and (select array_agg(a.attname::text order by a.attname)
              from unnest(i.indkey) as u(attnum)
              join pg_attribute a on a.attrelid = i.indrelid and a.attnum = u.attnum)
           = array['end_time', 'session_date', 'start_time', 'trainer_id']
  ) into has_unique_range;
  if not has_unique_range then
    if exists (
      select 1 from public.availability_slots
       group by trainer_id, session_date, start_time, end_time having count(*) > 1
    ) then
      raise exception '011: hay ventanas duplicadas (mismo entrenador, fecha, inicio y fin); resuélvelas antes';
    end if;
    raise notice '011: availability_slots: unique (trainer_id, session_date, start_time, end_time)';
    alter table public.availability_slots
      add constraint availability_slots_trainer_id_session_date_start_time_end_t_key
      unique (trainer_id, session_date, start_time, end_time);
  end if;

  -- ─── reservations: columnas del cliente ──────────────────────────────────
  alter table public.reservations
    add column if not exists client_name text,
    add column if not exists client_email text,
    add column if not exists client_phone text,
    add column if not exists price numeric;

  -- NOT NULL como en lo desplegado, si los datos lo permiten.
  if exists (select 1 from public.reservations where client_name is null or client_email is null) then
    raise notice '011: hay reservas sin client_name/client_email; se dejan esas columnas sin NOT NULL';
  else
    alter table public.reservations alter column client_name set not null;
    alter table public.reservations alter column client_email set not null;
  end if;

  -- Columnas de la 001 que el flujo de hoy no rellena: sin NOT NULL.
  for c in
    select column_name::text as col
      from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations'
       and column_name in ('client_id', 'session_time', 'class_type')
       and is_nullable = 'NO'
  loop
    raise notice '011: reservations.% deja de ser NOT NULL (columna de la 001)', c.col;
    execute format('alter table public.reservations alter column %I drop not null', c.col);
  end loop;

  -- ─── reservations.availability_slot_id NOT NULL (protege la 008) ─────────
  select string_agg(id::text, ', ') into missing
    from (select id from public.reservations where availability_slot_id is null limit 5) x;
  if missing is not null then
    raise exception '011: hay reservas sin ventana (availability_slot_id NULL), p. ej. %; sin ventana no tienen fecha ni protección contra solapes. Resuélvelas antes', missing;
  end if;
  alter table public.reservations alter column availability_slot_id set not null;
end $$;

comment on table public.class_types is
  'Tipos de clase de availability_slots.class_type (FK). Filas: private, group, academy. Migración 011 (en lo desplegado ya existía).';

commit;
