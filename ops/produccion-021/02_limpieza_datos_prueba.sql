-- ════════════════════════════════════════════════════════════════════════════
-- LIMPIEZA DE DATOS DE PRUEBA — reservas y paquetes (NO es una migración)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Contexto (27/09/2026): Dani confirma que TODAS las reservas y TODOS los
-- paquetes que hay hoy en Supabase son datos de prueba y se pueden eliminar.
-- Se conservan: cuentas de Auth, jugadores (players) y sus relaciones con
-- entrenadores (player_trainers), entrenadores, tipos de clase, precios,
-- horario semanal, excepciones, ventanas de disponibilidad y el resto de
-- configuración. reservations_backup_008 NO se toca (decisión aparte, ver
-- docs/PASO_A_PRODUCCION.md).
--
-- Cuándo: dentro de la ventana de mantenimiento, con TODOS los escritores
-- parados, ANTES de la 011 (procedimiento en docs/PASO_A_PRODUCCION.md).
-- También funciona si ya se aplicó parte de 011 → 021 (tablas de la 018,
-- 019 y 021), pero siempre antes de la 019 para no tener que decidir nada.
--
-- ─── Qué borra, exactamente ────────────────────────────────────────────────
--
--   reservas   todas las filas de public.reservations que existen al empezar
--              (y solo si su número y la última created_at coinciden con lo
--              medido en 01_consultas_previas.sql; si ha entrado alguna
--              nueva, se para sin tocar nada).
--   paquetes   todas las filas de public.client_packages (mismo control) y
--              sus public.package_sessions.
--   dependientes, borrados EXPLÍCITAMENTE antes de sus padres (nunca por
--   CASCADE ni SET NULL):
--              email_logs / whatsapp_logs de esas reservas; filas de la
--              018/019 (package_credit_resolutions, package_credit_quarantine)
--              y de la 021 (booking_requests) que las nombran, si existen;
--              package_sessions.reservation_id y reservations.
--              rescheduled_from_id se ponen a NULL antes de borrar.
--   derivado   en las ventanas que tenían esas reservas: current_bookings = 0
--              y status 'full' → 'available' (con cero reservas no pueden
--              estar llenas). No se borra ninguna ventana.
--
-- ─── Qué comprueba ─────────────────────────────────────────────────────────
--
--   * Bloqueo EXCLUSIVE de las tablas afectadas con lock_timeout: si hay un
--     escritor en marcha, falla sin cambiar nada.
--   * Inventario: toda FK que apunte a reservations, client_packages o
--     package_sessions tiene que ser una de las conocidas; todo trigger de
--     esas tablas que se dispare al borrar o actualizar tiene que ser uno
--     conocido. Si aparece otra, se para (hay que revisarla antes).
--   * Antes de cada DELETE, que no quede ninguna fila que apunte a lo que se
--     va a borrar: así ninguna acción ON DELETE (CASCADE / SET NULL) tiene
--     nada sobre lo que actuar, sea cual sea la acción real de la FK.
--   * Recuentos antes y después de TODAS las tablas implicadas y de las que
--     se conservan. Las conservadas tienen que quedar idénticas; si no, se
--     deshace todo.
--
-- ─── Cómo se usa ───────────────────────────────────────────────────────────
--
--   1. Rellenar los cinco valores del PASO 0 con lo que devolvió la consulta
--      C5 de 01_consultas_previas.sql, ya con los escritores parados.
--   2. Ejecutar con modo = 'ensayo': hace todo y al final lo DESHACE; el
--      error «ENSAYO OK …» lleva el resumen de lo que borraría.
--   3. Cambiar a modo = 'borrar' y ejecutar otra vez. La última consulta
--      devuelve la tabla de recuentos antes / después.
--
-- Supabase → SQL Editor → Run (como postgres). Todo en UNA transacción: si
-- algo falla, no se queda nada a medias.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- ─── PASO 0 — valores medidos (RELLENAR) ────────────────────────────────────

create temp table limpieza_param on commit drop as
select
  null::bigint /*RESERVAS_TOTAL*/      as reservas_total,   -- C5: reservas_total
  null::text   /*ULTIMA_RESERVA*/      as ultima_reserva,   -- C5: ultima_reserva (texto tal cual)
  null::bigint /*PAQUETES_TOTAL*/      as paquetes_total,   -- C5: paquetes_total
  null::bigint /*SESIONES_TOTAL*/      as sesiones_total,   -- C5: sesiones_total
  null::text   /*ULTIMO_PAQUETE*/      as ultimo_paquete,   -- C5: ultimo_paquete (texto tal cual)
  'ensayo'::text /*MODO*/              as modo;             -- 'ensayo' | 'borrar'

-- ─── PASO 1 — bloqueo, parámetros e inventario ──────────────────────────────

do $$
declare
  p limpieza_param%rowtype;
  t text;
  unknown text;
begin
  select * into p from limpieza_param;
  if p.reservas_total is null or p.paquetes_total is null or p.sesiones_total is null
     or p.modo is null or p.modo not in ('ensayo', 'borrar') then
    raise exception 'limpieza: rellena el PASO 0 (recuentos de la consulta C5 y modo ensayo/borrar)';
  end if;
  if (p.reservas_total > 0 and p.ultima_reserva is null) or (p.paquetes_total > 0 and p.ultimo_paquete is null) then
    raise exception 'limpieza: rellena ultima_reserva / ultimo_paquete (consulta C5)';
  end if;

  -- Escritores: si alguien escribe, esto espera como mucho lock_timeout y falla.
  foreach t in array array['public.reservations', 'public.client_packages', 'public.package_sessions',
                           'public.email_logs', 'public.whatsapp_logs', 'public.package_credit_resolutions',
                           'public.package_credit_quarantine', 'public.booking_requests', 'public.availability_slots'] loop
    if to_regclass(t) is not null then
      execute format('lock table %s in exclusive mode', t);
    end if;
  end loop;

  -- FKs que apuntan a lo que se borra: solo las conocidas (tabla.columna → tabla).
  select string_agg(format('%s.%s → %s (%s)', c.conrelid::regclass, a.attname, c.confrelid::regclass, c.conname), '; ')
    into unknown
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and c.confrelid in (to_regclass('public.reservations'), to_regclass('public.client_packages'), to_regclass('public.package_sessions'))
     and (array_length(c.conkey, 1) <> 1
          or (c.conrelid::regclass::text, a.attname::text, c.confrelid::regclass::text) not in (
               ('reservations', 'rescheduled_from_id', 'reservations'),
               ('reservations', 'package_session_id', 'package_sessions'),
               ('package_sessions', 'reservation_id', 'reservations'),
               ('package_sessions', 'client_package_id', 'client_packages'),
               ('email_logs', 'reservation_id', 'reservations'),
               ('whatsapp_logs', 'reservation_id', 'reservations'),
               ('package_credit_resolutions', 'reservation_id', 'reservations'),
               ('package_credit_resolutions', 'package_session_id', 'package_sessions'),
               ('package_credit_quarantine', 'reservation_id', 'reservations')));
  if unknown is not null then
    raise exception 'limpieza: FK desconocida hacia reservas/paquetes: %. Revísala y añádela a la limpieza antes de seguir', unknown;
  end if;

  -- Triggers de usuario que se dispararían al borrar / actualizar aquí.
  select string_agg(format('%s.%s', tgrelid::regclass, tgname), ', ')
    into unknown
    from pg_trigger
   where not tgisinternal
     and tgrelid in (to_regclass('public.reservations'), to_regclass('public.client_packages'), to_regclass('public.package_sessions'),
                     to_regclass('public.email_logs'), to_regclass('public.whatsapp_logs'), to_regclass('public.availability_slots'),
                     to_regclass('public.package_credit_resolutions'), to_regclass('public.package_credit_quarantine'),
                     to_regclass('public.booking_requests'))
     and (tgtype & (8 | 16)) <> 0          -- DELETE o UPDATE
     and tgname not in (
       'reservations_set_session_date',                -- 008 (fecha desde la ventana)
       'availability_slots_propagate_session_date',    -- 008
       'reservations_within_window',                   -- 015 (solo reservas vivas con rango)
       'availability_slots_keep_reservations_inside',  -- 015 (solo cambios de horario)
       'reservations_package_no_revive',               -- 019
       'reservations_legacy_quarantine',               -- 019
       'package_sessions_link_carries_credit',         -- 019 (solo reservation_id NO nulo)
       'update_reservations_updated_at', 'update_availability_slots_updated_at',
       'update_client_packages_updated_at', 'update_package_sessions_updated_at');
  if unknown is not null then
    raise exception 'limpieza: triggers desconocidos al borrar/actualizar: %. Revísalos antes de seguir', unknown;
  end if;
  if exists (select 1 from pg_rules where schemaname = 'public'
              and tablename in ('reservations', 'client_packages', 'package_sessions', 'email_logs', 'whatsapp_logs')) then
    raise exception 'limpieza: hay RULEs en tablas afectadas; revísalas antes de seguir';
  end if;
end $$;

-- ─── PASO 2 — qué se borra (fotografía al empezar) ──────────────────────────

create temp table obj_reservas on commit drop as select id, availability_slot_id from public.reservations;
create temp table obj_paquetes on commit drop as select id from public.client_packages;
create temp table obj_sesiones on commit drop as
  select id from public.package_sessions where client_package_id in (select id from obj_paquetes);
create temp table obj_ventanas on commit drop as
  select distinct availability_slot_id as id from obj_reservas where availability_slot_id is not null;

do $$
declare
  p limpieza_param%rowtype;
  n_r bigint; n_p bigint; n_s bigint; n_s_all bigint; last_r text; last_p text;
begin
  select * into p from limpieza_param;
  select count(*) into n_r from obj_reservas;
  select count(*) into n_p from obj_paquetes;
  select count(*) into n_s from obj_sesiones;
  select count(*) into n_s_all from public.package_sessions;
  select max(created_at)::text into last_r from public.reservations;
  select max(created_at)::text into last_p from public.client_packages;
  if n_r <> p.reservas_total or last_r is distinct from p.ultima_reserva then
    raise exception 'limpieza: las reservas no son las medidas (ahora % y última %, medidas % y %). ¿Hay escritores? Vuelve a medir (C5)', n_r, last_r, p.reservas_total, p.ultima_reserva;
  end if;
  if n_p <> p.paquetes_total or last_p is distinct from p.ultimo_paquete then
    raise exception 'limpieza: los paquetes no son los medidos (ahora % y último %, medidos % y %). Vuelve a medir (C5)', n_p, last_p, p.paquetes_total, p.ultimo_paquete;
  end if;
  if n_s <> p.sesiones_total or n_s_all <> n_s then
    raise exception 'limpieza: sesiones de paquete: % de los paquetes, % en total, medidas %', n_s, n_s_all, p.sesiones_total;
  end if;
end $$;

-- ─── PASO 3 — recuentos ANTES ───────────────────────────────────────────────

create temp table limpieza_recuento (
  tabla text primary key,
  papel text not null,          -- 'se limpia' | 'se conserva'
  antes bigint,
  despues bigint
) on commit drop;

insert into limpieza_recuento (tabla, papel)
select t, papel from (values
  ('public.reservations', 'se limpia'),
  ('public.client_packages', 'se limpia'),
  ('public.package_sessions', 'se limpia'),
  ('public.email_logs', 'se limpia'),
  ('public.whatsapp_logs', 'se limpia'),
  ('public.package_credit_resolutions', 'se limpia'),
  ('public.package_credit_quarantine', 'se limpia'),
  ('public.booking_requests', 'se limpia'),
  ('auth.users', 'se conserva'),
  ('public.players', 'se conserva'),
  ('public.player_trainers', 'se conserva'),
  ('public.trainers', 'se conserva'),
  ('public.users', 'se conserva'),
  ('public.class_types', 'se conserva'),
  ('public.trainer_session_prices', 'se conserva'),
  ('public.trainer_weekly_hours', 'se conserva'),
  ('public.trainer_availability_overrides', 'se conserva'),
  ('public.availability_slots', 'se conserva'),
  ('public.admins', 'se conserva'),
  ('public.reservations_backup_008', 'se conserva'),
  ('public.package_credit_cutoff', 'se conserva'),
  ('public.rate_limit_counters', 'se conserva')
) v(t, papel)
where to_regclass(t) is not null;

do $$
declare r record; n bigint;
begin
  for r in select tabla from limpieza_recuento loop
    execute format('select count(*) from %s', r.tabla) into n;
    update limpieza_recuento set antes = n where tabla = r.tabla;
  end loop;
end $$;

-- ─── PASO 4 — dependientes, explícitos y en orden ───────────────────────────

create temp table limpieza_pasos (orden serial, paso text, filas bigint) on commit drop;

do $$
declare n bigint;
begin
  -- Registros de avisos de esas reservas (FK a reservations; la acción real no importa).
  if to_regclass('public.email_logs') is not null then
    delete from public.email_logs where reservation_id in (select id from obj_reservas);
    get diagnostics n = row_count;
    insert into limpieza_pasos (paso, filas) values ('email_logs de las reservas', n);
  end if;
  if to_regclass('public.whatsapp_logs') is not null then
    delete from public.whatsapp_logs where reservation_id in (select id from obj_reservas);
    get diagnostics n = row_count;
    insert into limpieza_pasos (paso, filas) values ('whatsapp_logs de las reservas', n);
  end if;
  -- 018 / 019 (solo si ya existen).
  if to_regclass('public.package_credit_quarantine') is not null then
    execute 'delete from public.package_credit_quarantine where reservation_id in (select id from obj_reservas)';
    get diagnostics n = row_count;
    insert into limpieza_pasos (paso, filas) values ('package_credit_quarantine', n);
  end if;
  if to_regclass('public.package_credit_resolutions') is not null then
    execute 'delete from public.package_credit_resolutions
              where reservation_id in (select id from obj_reservas)
                 or package_session_id in (select id from obj_sesiones)';
    get diagnostics n = row_count;
    insert into limpieza_pasos (paso, filas) values ('package_credit_resolutions', n);
  end if;
  -- 021: claves de idempotencia que devuelven esas reservas.
  if to_regclass('public.booking_requests') is not null then
    execute 'delete from public.booking_requests
              where reservation_ids && (select coalesce(array_agg(id), ''{}'') from obj_reservas)';
    get diagnostics n = row_count;
    insert into limpieza_pasos (paso, filas) values ('booking_requests (021)', n);
  end if;
end $$;

-- Enlaces entre reservas y créditos, a NULL a mano (nunca por SET NULL).
with u as (
  update public.package_sessions set reservation_id = null
   where reservation_id in (select id from obj_reservas)
  returning 1
) insert into limpieza_pasos (paso, filas) select 'package_sessions.reservation_id → NULL', count(*) from u;

with u as (
  update public.reservations set rescheduled_from_id = null
   where rescheduled_from_id in (select id from obj_reservas)
  returning 1
) insert into limpieza_pasos (paso, filas) select 'reservations.rescheduled_from_id → NULL', count(*) from u;

-- Nada puede seguir apuntando a las reservas: ninguna acción ON DELETE tendrá
-- filas sobre las que actuar.
do $$
declare n bigint := 0; m bigint;
begin
  select count(*) into m from public.package_sessions where reservation_id in (select id from obj_reservas); n := n + m;
  select count(*) into m from public.reservations where rescheduled_from_id in (select id from obj_reservas); n := n + m;
  if to_regclass('public.email_logs') is not null then
    select count(*) into m from public.email_logs where reservation_id in (select id from obj_reservas); n := n + m;
  end if;
  if to_regclass('public.whatsapp_logs') is not null then
    select count(*) into m from public.whatsapp_logs where reservation_id in (select id from obj_reservas); n := n + m;
  end if;
  if to_regclass('public.package_credit_resolutions') is not null then
    execute 'select count(*) from public.package_credit_resolutions where reservation_id in (select id from obj_reservas)' into m; n := n + m;
  end if;
  if to_regclass('public.package_credit_quarantine') is not null then
    execute 'select count(*) from public.package_credit_quarantine where reservation_id in (select id from obj_reservas)' into m; n := n + m;
  end if;
  if n <> 0 then
    raise exception 'limpieza: aún hay % filas que apuntan a las reservas; no se borra nada', n;
  end if;
end $$;

-- ─── PASO 5 — reservas, sesiones y paquetes ─────────────────────────────────

with d as (
  delete from public.reservations where id in (select id from obj_reservas) returning 1
) insert into limpieza_pasos (paso, filas) select 'reservations', count(*) from d;

-- Tras la 019, reservations.package_session_id apunta a package_sessions: ya
-- no queda ninguna reserva. Comprobado igualmente antes de borrar sesiones.
do $$
declare m bigint;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'reservations' and column_name = 'package_session_id') then
    execute 'select count(*) from public.reservations where package_session_id in (select id from obj_sesiones)' into m;
    if m <> 0 then raise exception 'limpieza: % reservas siguen apuntando a sesiones de paquete', m; end if;
  end if;
  if to_regclass('public.package_credit_resolutions') is not null then
    execute 'select count(*) from public.package_credit_resolutions where package_session_id in (select id from obj_sesiones)' into m;
    if m <> 0 then raise exception 'limpieza: % decisiones siguen apuntando a sesiones de paquete', m; end if;
  end if;
end $$;

with d as (
  delete from public.package_sessions where id in (select id from obj_sesiones) returning 1
) insert into limpieza_pasos (paso, filas) select 'package_sessions', count(*) from d;

with d as (
  delete from public.client_packages where id in (select id from obj_paquetes) returning 1
) insert into limpieza_pasos (paso, filas) select 'client_packages', count(*) from d;

-- ─── PASO 6 — dato derivado de las ventanas afectadas ───────────────────────

with u as (
  update public.availability_slots
     set current_bookings = 0,
         status = case when status = 'full' then 'available' else status end
   where id in (select id from obj_ventanas)
     and (current_bookings is distinct from 0 or status = 'full')
  returning 1
) insert into limpieza_pasos (paso, filas) select 'ventanas: current_bookings 0 / full → available', count(*) from u;

-- ─── PASO 7 — recuentos DESPUÉS y comprobación ──────────────────────────────

do $$
declare r record; n bigint; bad text;
begin
  for r in select tabla from limpieza_recuento loop
    execute format('select count(*) from %s', r.tabla) into n;
    update limpieza_recuento set despues = n where tabla = r.tabla;
  end loop;

  select string_agg(format('%s %s→%s', tabla, antes, despues), ', ') into bad
    from limpieza_recuento where papel = 'se conserva' and antes is distinct from despues;
  if bad is not null then
    raise exception 'limpieza: cambió una tabla que se conserva (%); se deshace todo', bad;
  end if;

  -- Lo que se limpia: exactamente lo previsto, sin nada más.
  if (select despues from limpieza_recuento where tabla = 'public.reservations')
       <> (select antes from limpieza_recuento where tabla = 'public.reservations') - (select count(*) from obj_reservas)
     or (select despues from limpieza_recuento where tabla = 'public.client_packages')
       <> (select antes from limpieza_recuento where tabla = 'public.client_packages') - (select count(*) from obj_paquetes)
     or (select despues from limpieza_recuento where tabla = 'public.package_sessions')
       <> (select antes from limpieza_recuento where tabla = 'public.package_sessions') - (select count(*) from obj_sesiones) then
    raise exception 'limpieza: los recuentos finales no cuadran; se deshace todo';
  end if;
end $$;

-- ─── PASO 8 — ensayo o borrado ──────────────────────────────────────────────

do $$
declare resumen text;
begin
  select string_agg(format('%s: %s', paso, filas), '; ' order by orden) into resumen from limpieza_pasos;
  if (select modo from limpieza_param) = 'ensayo' then
    raise exception 'ENSAYO OK (nada guardado; cambia modo a ''borrar'' para aplicarlo). %', resumen;
  end if;
  raise notice 'LIMPIEZA HECHA. %', resumen;
end $$;

select tabla, papel, antes, despues, antes - despues as borradas
  from limpieza_recuento
 order by papel desc, tabla;

commit;
