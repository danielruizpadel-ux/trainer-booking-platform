-- 011 — Clase puntual atómica: ventana propia + reserva en UNA transacción
--
-- Requiere, en este orden: 008 (reservations_no_overlap + trigger de fecha)
-- y 010 (player_count, whatsapp_opt_in).
--
-- «Crear clase puntual» (dashboard) reserva un tramo para un cliente aunque
-- esté fuera de la disponibilidad. `reservations.availability_slot_id` es NOT
-- NULL y `reservations.session_date` la pone el trigger de la 008 desde la
-- ventana, así que la clase necesita una ventana: una fila de
-- availability_slots del tamaño EXACTO de la clase, `status = 'blocked'`
-- (cerrada: la web nunca la ofrece) y `generated_by_pattern = false` (el
-- generador semanal no la toca).
--
-- Antes (commit 1b115e9) la app lo hacía en dos llamadas —crear ventana,
-- insertar reserva— y, si la reserva fallaba, borraba la ventana. Entre medias
-- otra petición podía reutilizar esa ventana recién creada y la limpieza
-- podía chocar con ella (o fallar y dejar la ventana huérfana). Aquí todo va
-- en una función: si cualquier paso falla, Postgres deshace la transacción
-- entera y no hay nada que limpiar.
--
--   * pg_advisory_xact_lock por (entrenador, fecha): dos clases puntuales del
--     mismo entrenador y día se hacen una detrás de otra; la segunda ve la
--     ventana y la reserva de la primera ya confirmadas (o nada, si la
--     primera se deshizo). El cerrojo se suelta solo al terminar la
--     transacción.
--   * Las reservas que NO pasan por aquí (web, manual en ventana abierta) no
--     cogen el cerrojo: contra ellas protege `reservations_no_overlap` (008),
--     que sigue siendo la red final.
--   * Una ventana con el rango exacto solo se reutiliza si es manual y
--     `blocked` (la de una clase puntual cancelada). Otra cualquiera →
--     error 'one_off_window_conflict'. Una violación de unicidad al crear la
--     ventana (sea cual sea la forma del unique de availability_slots en ese
--     entorno) también → 'one_off_window_conflict'.
--
-- Errores que devuelve (los traduce lib/reservations/one-off.ts):
--   23P01 + 'reservations_no_overlap'  → el tramo pisa una reserva viva (409)
--   P0001 'one_off_window_conflict'    → ya hay otra ventana con ese rango (409)
--   22023 'one_off_invalid_*'          → datos no válidos (400)
--
-- PASO 0 comprueba que el esquema desplegado admite lo que escribe la
-- función (class_type 'private', status 'blocked', columnas de la 010). El
-- esquema de migrations/001 NO lo admite (CHECK de class_type y status): si
-- este entorno viene de ahí, la migración se para con un mensaje claro en vez
-- de fallar después en cada clase puntual.
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres). Idempotente. Va en
-- una transacción: si algo falla, no se queda nada a medias. Después:
--   notify pgrst, 'reload schema';

begin;

-- ─── PASO 0 — requisitos y compatibilidad del esquema ───────────────────────

do $$
declare
  fk record;
  ok boolean;
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'reservations_no_overlap' and conrelid = 'public.reservations'::regclass
  ) then
    raise exception '011 requiere la 008: no existe la restricción reservations_no_overlap';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgname = 'reservations_set_session_date' and tgrelid = 'public.reservations'::regclass
  ) then
    raise exception '011 requiere la 008: no existe el trigger reservations_set_session_date';
  end if;
  if exists (
    select 1
      from (values ('reservations', 'player_count'), ('reservations', 'whatsapp_opt_in'),
                   ('reservations', 'duration_minutes'), ('reservations', 'start_time'),
                   ('reservations', 'end_time'), ('availability_slots', 'generated_by_pattern')) as need(tbl, col)
     where not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = need.tbl and c.column_name = need.col)
  ) then
    raise exception '011 requiere la 005, 007 y 010: faltan columnas (player_count, whatsapp_opt_in, duration_minutes, start_time/end_time o generated_by_pattern)';
  end if;

  -- class_type = 'private' tiene que existir en la tabla a la que apunte la FK
  -- (en el esquema desplegado: class_types.name).
  for fk in
    select c.confrelid::regclass as ref_table, ra.attname as ref_col
      from pg_constraint c
      join pg_attribute a  on a.attrelid = c.conrelid  and a.attnum = c.conkey[1]
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
     where c.conrelid = 'public.availability_slots'::regclass
       and c.contype = 'f' and a.attname = 'class_type'
  loop
    execute format('select exists (select 1 from %s where %I = %L)', fk.ref_table, fk.ref_col, 'private') into ok;
    if not ok then
      raise exception '011: availability_slots.class_type apunta a %.% y ahí no existe ''private''', fk.ref_table, fk.ref_col;
    end if;
  end loop;

  -- CHECKs de availability_slots: prueba real con una fila de mentira que se
  -- deshace siempre. Con session_replication_role = replica no se disparan
  -- FKs ni triggers (el entrenador no existe), pero los CHECK sí se evalúan.
  begin
    perform set_config('session_replication_role', 'replica', true);
    insert into public.availability_slots
      (trainer_id, session_date, start_time, end_time, class_type, status, current_bookings, max_capacity, generated_by_pattern)
    values
      (gen_random_uuid(), date '1900-01-01', time '00:00', time '00:30', 'private', 'blocked', 0, 1, false);
    raise exception using errcode = 'P0011', message = '011 dry run ok';
  exception
    when sqlstate 'P0011' then
      null; -- compatible; la fila se ha deshecho
    when check_violation or not_null_violation then
      raise exception '011: availability_slots no admite una ventana private/blocked (%). ¿Esquema de migrations/001?', sqlerrm;
    when insufficient_privilege then
      raise warning '011: sin permiso para la prueba de CHECK (ejecutar como postgres); se sigue sin ella';
  end;
  -- No hace falta restaurar session_replication_role: el bloque de arriba
  -- siempre termina en excepción, y eso deshace también el set_config local.
end $$;

-- ─── La función ─────────────────────────────────────────────────────────────

create or replace function public.create_one_off_reservation(
  p_trainer_id uuid,
  p_session_date date,
  p_start_time time,
  p_end_time time,
  p_duration_minutes integer,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_notes text,
  p_price numeric,
  p_status text
)
returns table (reservation_id uuid, window_id uuid, window_reused boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_window record;
  v_window_id uuid;
  v_reused boolean := false;
  v_reservation_id uuid;
begin
  if p_status is null or p_status not in ('confirmed', 'pending_confirmation') then
    raise exception using errcode = '22023', message = 'one_off_invalid_status';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time
     or p_duration_minutes is distinct from (extract(epoch from (p_end_time - p_start_time)) / 60)::integer then
    raise exception using errcode = '22023', message = 'one_off_invalid_range';
  end if;

  -- Una clase puntual por entrenador y día a la vez (ver cabecera).
  perform pg_advisory_xact_lock(hashtextextended('one_off:' || p_trainer_id::text || ':' || p_session_date::text, 0));

  -- Aviso claro antes de escribir; la restricción de la 008 sigue siendo la red.
  if exists (
    select 1 from reservations r
     where r.trainer_id = p_trainer_id
       and r.session_date = p_session_date
       and r.start_time < p_end_time and p_start_time < r.end_time
       and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
  ) then
    raise exception using errcode = '23P01', message = 'one_off_overlap (reservations_no_overlap)';
  end if;

  select s.id, s.status, s.generated_by_pattern
    into v_window
    from availability_slots s
   where s.trainer_id = p_trainer_id
     and s.session_date = p_session_date
     and s.start_time = p_start_time
     and s.end_time = p_end_time
   order by s.created_at
   limit 1
   for update;

  if found then
    if v_window.generated_by_pattern is distinct from false or lower(coalesce(v_window.status, '')) <> 'blocked' then
      raise exception using errcode = 'P0001', message = 'one_off_window_conflict';
    end if;
    v_window_id := v_window.id;
    v_reused := true;
  else
    begin
      insert into availability_slots
        (trainer_id, session_date, start_time, end_time, class_type, status, current_bookings, max_capacity, generated_by_pattern)
      values
        (p_trainer_id, p_session_date, p_start_time, p_end_time, 'private', 'blocked', 0, 1, false)
      returning id into v_window_id;
    exception when unique_violation then
      raise exception using errcode = 'P0001', message = 'one_off_window_conflict', detail = sqlerrm;
    end;
  end if;

  insert into reservations
    (trainer_id, availability_slot_id, client_name, client_email, client_phone, notes,
     start_time, end_time, duration_minutes, price, player_count, whatsapp_opt_in, status)
  values
    (p_trainer_id, v_window_id, p_client_name, p_client_email, p_client_phone, p_notes,
     p_start_time, p_end_time, p_duration_minutes, p_price, 1, false, p_status)
  returning id into v_reservation_id;

  update availability_slots s
     set current_bookings = (
           select count(*) from reservations r
            where r.availability_slot_id = s.id
              and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')),
         updated_at = now()
   where s.id = v_window_id;

  return query select v_reservation_id, v_window_id, v_reused;
end;
$$;

comment on function public.create_one_off_reservation(uuid, date, time, time, integer, text, text, text, text, numeric, text) is
  'Clase puntual del dashboard: ventana exacta blocked/manual + reserva en una transacción, serializada por entrenador y día. Solo service_role. Migración 011.';

-- Solo el servidor (service role). Nunca anon/authenticated: el entrenador
-- lo pone la ruta desde la sesión, no quien llama.
revoke all on function public.create_one_off_reservation(uuid, date, time, time, integer, text, text, text, text, numeric, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.create_one_off_reservation(uuid, date, time, time, integer, text, text, text, text, numeric, text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.create_one_off_reservation(uuid, date, time, time, integer, text, text, text, text, numeric, text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_one_off_reservation(uuid, date, time, time, integer, text, text, text, text, numeric, text) to service_role';
  end if;
end $$;

commit;
