-- ════════════════════════════════════════════════════════════════════════════
-- CONSULTAS PREVIAS — SOLO LECTURA (no cambian nada)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Para confirmar que docs/PASO_A_PRODUCCION.md y 02_limpieza_datos_prueba.sql
-- encajan con la base real. Supabase → SQL Editor, una consulta cada vez (el
-- editor enseña solo el último resultado). Ninguna escribe; se pueden
-- ejecutar con la app en marcha, salvo C5, que se repite con los escritores
-- parados justo antes de la limpieza.
--
-- Lo ya comprobado el 27/09/2026 (no hace falta repetirlo, salvo en C0):
-- FK reservas → ventanas ON DELETE CASCADE; existe reservations_no_overlap;
-- 0 reservas sin ventana; existe class_types 'private'; 0 reservas vivas
-- fuera de su ventana; 20 reservas vivas desde el primer paquete de su
-- entrenador (18 sin enlace directo); existen reservations_backup_008 y las
-- tablas de paquetes; no existen admins ni las funciones nuevas; no hay
-- supabase_migrations.schema_migrations.

-- ─── C0. Qué migraciones de 011 → 021 hay ya (todo debería salir false) ────
select
  exists (select 1 from pg_proc where proname = 'create_one_off_reservation')                         as m012,
  (select confdeltype = 'r' from pg_constraint
    where conrelid = 'public.reservations'::regclass and confrelid = 'public.availability_slots'::regclass) as m013_restrict,
  exists (select 1 from pg_proc where proname = 'apply_window_plan')                                  as m014,
  exists (select 1 from pg_trigger where tgname = 'reservations_within_window')                       as m015,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'trainers' and column_name = 'availability_revision') as m016,
  exists (select 1 from pg_proc where proname = 'schedule_package_session')                           as m017,
  to_regclass('public.package_credit_resolutions') is not null                                         as m018,
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'reservations' and column_name = 'package_session_id') as m019,
  to_regclass('public.admins') is not null                                                             as m020,
  to_regclass('public.booking_requests') is not null                                                   as m021;

-- ─── C1. Todas las FKs que apuntan a reservas, paquetes o sesiones ─────────
-- La limpieza conoce: reservations.rescheduled_from_id, package_sessions.
-- reservation_id, package_sessions.client_package_id, email_logs.
-- reservation_id, whatsapp_logs.reservation_id (y las de 018/019). Cualquier
-- otra fila aquí hay que revisarla antes (la limpieza se para si la ve).
select c.conrelid::regclass as tabla, a.attname as columna, c.confrelid::regclass as apunta_a,
       c.conname, case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
         when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete,
       array_length(c.conkey, 1) as n_columnas
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
 where c.contype = 'f'
   and c.confrelid in ('public.reservations'::regclass, 'public.client_packages'::regclass, 'public.package_sessions'::regclass)
 order by 3, 1, 2;

-- ─── C2. Triggers y reglas en las tablas que toca la limpieza ──────────────
-- Esperado hoy: reservations_set_session_date y availability_slots_propagate_
-- session_date (008) y, si existen, update_*_updated_at. Cualquier otro
-- (webhooks de Supabase, auditoría…) hay que mirarlo antes.
select tgrelid::regclass as tabla, tgname, pg_get_triggerdef(oid) as definicion
  from pg_trigger
 where not tgisinternal
   and tgrelid in ('public.reservations'::regclass, 'public.client_packages'::regclass, 'public.package_sessions'::regclass,
                   'public.availability_slots'::regclass,
                   coalesce(to_regclass('public.email_logs'), 'public.reservations'::regclass),
                   coalesce(to_regclass('public.whatsapp_logs'), 'public.reservations'::regclass))
 order by 1, 2;
-- y reglas / vistas que dependen de reservations:
select distinct v.oid::regclass as vista_o_regla
  from pg_depend d join pg_rewrite w on w.oid = d.objid join pg_class v on v.oid = w.ev_class
 where d.refobjid = 'public.reservations'::regclass and v.oid <> 'public.reservations'::regclass;

-- ─── C3. Escritores fuera de la app: pg_cron, webhooks, conexiones ─────────
select to_regclass('cron.job') is not null as hay_pg_cron,
       to_regclass('supabase_functions.hooks') is not null as hay_webhooks,
       to_regclass('net.http_request_queue') is not null as hay_pg_net;
-- si hay_pg_cron:   select jobid, schedule, command, active from cron.job;
-- si hay_webhooks:  select * from supabase_functions.hooks order by id desc limit 20;
-- Conexiones abiertas ahora (quién podría escribir):
select usename, application_name, client_addr, state, backend_start, left(query, 60) as ultima_consulta
  from pg_stat_activity
 where datname = current_database() and pid <> pg_backend_pid()
 order by backend_start;

-- ─── C4. Qué se va a borrar y qué depende de ello ──────────────────────────
select 'reservas' as que, count(*) as total,
       count(*) filter (where coalesce(status, '') not in ('cancelled', 'canceled', 'needs_reschedule')) as vivas,
       min(created_at)::text as primera, max(created_at)::text as ultima
  from public.reservations
union all
select 'reservas que son propuesta (rescheduled_from_id)', count(*), null, null, null
  from public.reservations where rescheduled_from_id is not null
union all
select 'reservas con player_id', count(*), null, null, null from public.reservations where player_id is not null
union all
select 'paquetes', count(*), count(*) filter (where status = 'active'), min(created_at)::text, max(created_at)::text
  from public.client_packages
union all
select 'sesiones de paquete', count(*), count(*) filter (where reservation_id is not null), null, null
  from public.package_sessions;

select 'email_logs' as tabla, count(*) as total,
       count(*) filter (where reservation_id is not null) as con_reserva,
       count(*) filter (where reservation_id is null) as sin_reserva
  from public.email_logs
union all
select 'whatsapp_logs', count(*), count(*) filter (where reservation_id is not null), count(*) filter (where reservation_id is null)
  from public.whatsapp_logs;

-- Ventanas que tenían reservas (la limpieza solo corrige su contador y 'full').
select s.status, count(distinct s.id) as ventanas,
       count(distinct s.id) filter (where s.current_bookings > 0) as con_contador,
       count(distinct s.id) filter (where s.session_date >= current_date) as futuras
  from public.availability_slots s
 where s.id in (select availability_slot_id from public.reservations)
 group by 1 order by 1;

-- Relaciones jugador ↔ entrenador creadas al reservar (se CONSERVAN; ver
-- decisiones pendientes en docs/PASO_A_PRODUCCION.md).
select source, status, count(*) from public.player_trainers group by 1, 2 order by 1, 2;

-- ─── C5. Valores para el PASO 0 de la limpieza (con escritores PARADOS) ────
select (select count(*) from public.reservations)              as reservas_total,
       (select max(created_at)::text from public.reservations) as ultima_reserva,
       (select count(*) from public.client_packages)           as paquetes_total,
       (select count(*) from public.package_sessions)          as sesiones_total,
       (select max(created_at)::text from public.client_packages) as ultimo_paquete;

-- ─── C6. reservations_backup_008: qué es y quién la usa ────────────────────
-- Copia manual hecha al aplicar la 008 (docs/ANTES_DE_PUBLICAR.md, punto 4).
-- La limpieza NO la toca. Para decidir:
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'reservations_backup_008' order by ordinal_position;
select count(*) as filas, min(created_at)::text as primera, max(created_at)::text as ultima,
       count(*) filter (where id in (select id from public.reservations)) as siguen_en_reservations,
       count(*) filter (where id not in (select id from public.reservations)) as solo_en_la_copia
  from public.reservations_backup_008;
-- ¿Algo depende de ella? (FKs, vistas); ¿está expuesta?
select 'fk' as tipo, conname::text as nombre from pg_constraint
 where contype = 'f' and (conrelid = 'public.reservations_backup_008'::regclass or confrelid = 'public.reservations_backup_008'::regclass)
union all
select 'vista', v.oid::regclass::text from pg_depend d join pg_rewrite w on w.oid = d.objid join pg_class v on v.oid = w.ev_class
 where d.refobjid = 'public.reservations_backup_008'::regclass and v.oid <> 'public.reservations_backup_008'::regclass;
select relrowsecurity as rls_activo,
       has_table_privilege('anon', 'public.reservations_backup_008', 'select') as anon_select,
       has_table_privilege('authenticated', 'public.reservations_backup_008', 'select') as authenticated_select,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reservations_backup_008') as politicas
  from pg_class where oid = 'public.reservations_backup_008'::regclass;

-- ─── C7. Requisitos de 011 → 021 que dependen de datos o del esquema real ──
-- 011: ventanas duplicadas (debe ser 0) y CHECK de status (si existe, debe admitir 'blocked').
select count(*) as ventanas_duplicadas from (
  select 1 from public.availability_slots group by trainer_id, session_date, start_time, end_time having count(*) > 1) d;
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.availability_slots'::regclass and contype = 'c';
-- 013: exactamente UNA FK de reservations a availability_slots, de availability_slot_id.
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.reservations'::regclass and confrelid = 'public.availability_slots'::regclass;
-- 015/019: CHECK de reservations.status (la 019 y las funciones escriben estos estados).
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.reservations'::regclass and contype = 'c';
-- btree_gist (008) y dónde está:
select extname, extnamespace::regnamespace from pg_extension where extname in ('btree_gist', 'pgcrypto');
-- Duración de clases configurada (los datos que se conservan):
select slug, class_durations,
       (select count(*) from public.trainer_session_prices p where p.trainer_id = t.id) as precios,
       (select count(*) from public.trainer_weekly_hours h where h.trainer_id = t.id) as franjas_semanales
  from public.trainers t order by slug;
