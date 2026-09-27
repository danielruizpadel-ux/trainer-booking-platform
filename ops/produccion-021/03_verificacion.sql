-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN TRAS 011 → 021 — SOLO LECTURA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Supabase → SQL Editor, después de aplicar la 021 y `notify pgrst, 'reload
-- schema';`, ANTES de desplegar el código. V1 tiene que salir todo true; V2 a
-- V4, vacías o como se indica. Lo mismo comprueba en local
-- scripts/verify-prod-transition-db.sh.

-- ─── V1. Cada migración está (todo true) ───────────────────────────────────
select
  (select count(*) = 0 from pg_constraint where conrelid = 'public.reservations'::regclass
     and contype = 'c' and pg_get_constraintdef(oid) ilike '%client_id%')                             as m011,
  (select attnotnull from pg_attribute where attrelid = 'public.reservations'::regclass
     and attname = 'availability_slot_id')                                                              as m011_slot_not_null,
  exists (select 1 from pg_proc where proname = 'create_one_off_reservation')                         as m012,
  (select confdeltype = 'r' from pg_constraint where conrelid = 'public.reservations'::regclass
     and confrelid = 'public.availability_slots'::regclass)                                             as m013_restrict,
  (select count(*) = 1 from pg_proc where proname = 'apply_window_plan' and pronargs = 3)              as m014_016_con_revision,
  (select count(*) = 0 from pg_proc where proname = 'apply_window_plan' and pronargs = 2)              as m016_sin_version_vieja,
  exists (select 1 from pg_trigger where tgname = 'reservations_within_window')                       as m015,
  exists (select 1 from pg_trigger where tgname = 'availability_slots_keep_reservations_inside')      as m015_ventanas,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'trainers' and column_name = 'availability_revision')                      as m016,
  exists (select 1 from pg_proc where proname = 'unschedule_package_session')                         as m017,
  to_regclass('public.package_credit_backfill_report') is not null                                    as m018,
  (select confdeltype = 'r' from pg_constraint where conrelid = 'public.reservations'::regclass
     and confrelid = 'public.package_sessions'::regclass)                                               as m019_fk_restrict,
  to_regclass('public.reservations_one_live_per_package_session') is not null                         as m019_indice,
  exists (select 1 from pg_proc where proname = 'propose_reschedule')                                 as m019_proponer,
  to_regclass('public.admins') is not null                                                             as m020,
  exists (select 1 from pg_proc where proname = 'create_booking_request')                             as m021,
  exists (select 1 from pg_proc where proname = 'rate_limit_consume')                                 as m021_limite,
  exists (select 1 from pg_constraint where conname = 'reservations_no_overlap')                      as m008_sigue;

-- ─── V2. Integridad (vacías) ───────────────────────────────────────────────
select * from public.package_credit_integrity_check where bloquea;
select problema, count(*) from public.package_credit_backfill_report group by 1;   -- vacío tras la limpieza
select r.id from public.reservations r join public.availability_slots s on s.id = r.availability_slot_id
 where coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
   and (r.start_time < s.start_time or r.end_time > s.end_time);

-- ─── V3. Seguridad de lo nuevo (todo false) ────────────────────────────────
select
  has_table_privilege('anon', 'public.admins', 'select')                                      as anon_admins,
  has_table_privilege('authenticated', 'public.admins', 'select')                             as auth_admins,
  has_table_privilege('anon', 'public.booking_requests', 'select')                            as anon_booking_requests,
  has_table_privilege('authenticated', 'public.rate_limit_counters', 'insert')                 as auth_rate_limit,
  has_function_privilege('anon', 'public.create_booking_request(text, uuid, text, jsonb, jsonb)', 'execute') as anon_create_booking,
  has_function_privilege('authenticated', 'public.rate_limit_consume(text[], integer[], integer)', 'execute') as auth_rate_consume,
  has_function_privilege('anon', 'public.schedule_package_session(uuid, uuid, uuid, time, text)', 'execute') as anon_schedule,
  has_function_privilege('anon', 'public.create_one_off_reservation(uuid, date, time, time, integer, text, text, text, text, numeric, text)', 'execute') as anon_one_off;

-- ─── V4. Lo que se conservó sigue ahí (compara con la tabla de la limpieza) ─
select (select count(*) from auth.users) as auth_users, (select count(*) from public.players) as players,
       (select count(*) from public.player_trainers) as player_trainers, (select count(*) from public.trainers) as trainers,
       (select count(*) from public.trainer_session_prices) as precios, (select count(*) from public.trainer_weekly_hours) as horario,
       (select count(*) from public.trainer_availability_overrides) as excepciones, (select count(*) from public.class_types) as tipos,
       (select count(*) from public.availability_slots) as ventanas, (select count(*) from public.reservations) as reservas,
       (select count(*) from public.client_packages) as paquetes;
