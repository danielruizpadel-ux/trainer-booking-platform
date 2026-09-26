-- 017 — Agendar y desagendar una sesión de paquete son transiciones atómicas
--
-- Requiere 004 (proposal_token), 006 (paquetes), 007 (rango en reservations,
-- duración del paquete), 008 (reservations_no_overlap) y 010 (player_count /
-- whatsapp_opt_in). Lo comprueba el PASO 0 y aborta si falta algo.
--
-- El problema: lib/packages/schedule.ts leía la sesión, decidía en memoria
-- que el crédito estaba libre, insertaba la reserva y DESPUÉS enlazaba el
-- crédito, en llamadas sueltas a PostgREST. Dos peticiones para la misma
-- package_session (dos pestañas, doble clic, incluso en horas distintas que
-- no chocan en reservations_no_overlap) pasaban las dos la comprobación y
-- creaban dos reservas vivas; la segunda sobrescribía reservation_id y la
-- primera quedaba viva y huérfana (ocupando hueco, sin crédito que la cuente).
-- Si el enlace fallaba después del insert, también quedaba huérfana.
-- Desagendar tenía el mismo defecto al revés: cancelaba la reserva y después,
-- en otra escritura, soltaba el crédito; si la segunda fallaba quedaba una
-- reserva cancelada enlazada a un crédito todavía `scheduled`.
--
-- La solución son dos funciones; cada una es una sola transacción que
-- empieza con SELECT ... FOR UPDATE de la fila de package_sessions, así que
-- cualquier par de llamadas sobre el mismo crédito (agendar/agendar,
-- agendar/desagendar, desagendar/desagendar) se pone en cola y la segunda
-- relee la fila tal como la dejó la primera.
--
--   schedule_package_session    comprueba dueño, paquete activo, crédito libre
--                               (misma regla que reservationHoldsSlot) y las
--                               invariantes de la ventana; inserta la reserva
--                               (datos y precio SALEN DEL PAQUETE) y la enlaza.
--   unschedule_package_session  comprueba dueño y que el crédito sigue
--                               enlazado a la reserva que vio la app; cancela
--                               esa reserva si sigue viva y suelta el crédito.
--
-- Si cualquier paso falla (p. ej. 23P01 de reservations_no_overlap), no queda
-- nada a medias: ni reserva sin crédito, ni crédito con una reserva a medio
-- cancelar.
--
-- Un UNIQUE(reservation_id) no bastaría: cada petición crea su propia reserva
-- con un id nuevo, así que no chocan; la carrera está en el crédito.
--
-- ─── Qué valida la función de agendar y qué queda fuera ─────────────────────
--
-- Dentro de la transacción (la app no puede saltárselo aunque llame directo):
--   * la ventana existe, es de p_trainer_id y está abierta (misma lista de
--     estados cerrados que isSlotOpen, lib/availability/slot-status.ts); se
--     lee con FOR SHARE, así que no se puede cerrar a mitad de la transacción;
--   * [inicio, inicio + duración) cabe entera dentro de la ventana (fitsInWindow);
--   * la duración del paquete es 60 o 90 y la clase no cruza medianoche;
--   * la hora no ha empezado ya en Asia/Kuala_Lumpur (isPastMalaysiaSession:
--     "pasada" = anterior al minuto actual);
--   * el solape con otra reserva viva del entrenador ese día, de cualquier
--     ventana: lo garantiza la restricción reservations_no_overlap (008) en el
--     propio INSERT (23P01 → la transacción entera se deshace).
-- Fuera (solo en lib/packages/schedule.ts, antes de llamar):
--   * loadOwnedOpenWindow y isPastMalaysiaSession se siguen ejecutando para
--     responder pronto y con el mensaje de siempre. Son un duplicado de lo de
--     arriba, no una condición necesaria: si divergieran, manda la función.
--   * refreshWindowStatus (recalcular `full` / current_bookings) va después
--     del COMMIT. Es un dato derivado: si falla, la ventana puede quedar
--     `available` con el hueco ya ocupado, pero la siguiente reserva en esa
--     franja la rechaza reservations_no_overlap. No permite una reserva
--     inválida.
--   * que el entrenador siga ofreciendo esa duración (trainers.class_durations):
--     el paquete la fijó al venderse y sus sesiones la conservan aunque luego
--     el entrenador deje de ofrecerla. Es la regla de la 007, no un hueco.
--   * la rejilla de inicios (:00/:30): tampoco la exigía loadOwnedOpenWindow;
--     una hora fuera de rejilla solo se puede pedir con una llamada directa y
--     no rompe ninguna invariante (cabe en la ventana, no solapa).
--
-- Seguridad: SECURITY INVOKER (se ejecutan con los permisos de quien llama).
-- Solo service_role puede ejecutarlas; anon/authenticated no (sin esto
-- PostgREST las expondría como /rpc/...). El trainer_id lo pasa el servidor
-- desde requireTrainer(), nunca el navegador.
--
-- Aplicar en Supabase → SQL Editor → Run, ANTES de desplegar el código que las
-- llama (sin ellas, agendar/desagendar una sesión de paquete falla con un
-- error claro y sin escribir nada). Idempotente (create or replace). Todo en
-- una transacción.
--
-- ROLLBACK (el código nuevo deja de poder agendar/desagendar sesiones de paquete):
--   drop function if exists public.schedule_package_session(uuid, uuid, uuid, time, text);
--   drop function if exists public.unschedule_package_session(uuid, uuid, uuid);
--   notify pgrst, 'reload schema';

begin;

-- ─── PASO 0 — requisitos ────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.package_sessions') is null or to_regclass('public.client_packages') is null then
    raise exception '017 requiere la 006: faltan client_packages / package_sessions';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'client_packages' and column_name = 'duration_minutes'
  ) then
    raise exception '017 requiere la 007: falta client_packages.duration_minutes';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'reservations_no_overlap'
       and conrelid = 'public.reservations'::regclass
  ) then
    raise exception '017 requiere la 008: no existe la restricción reservations_no_overlap';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations' and column_name = 'whatsapp_opt_in'
  ) then
    raise exception '017 requiere la 010: falta reservations.whatsapp_opt_in';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations' and column_name = 'proposal_token'
  ) then
    raise exception '017 requiere la 004: falta reservations.proposal_token';
  end if;
end
$$;

-- ─── Agendar ────────────────────────────────────────────────────────────────
--
-- Devuelve una fila (outcome, reservation_id):
--   scheduled          ok; reservation_id = la reserva creada y enlazada
--   not_found          la sesión, su paquete o la ventana no existen
--   forbidden          el paquete o la ventana no son de p_trainer_id
--   package_inactive   el paquete no está activo
--   already_scheduled  el crédito ya tiene una reserva viva (o está completed/cancelled)
--   window_closed      la ventana no está abierta (isSlotOpen)
--   out_of_window      la clase no cabe entera dentro de la ventana
--   past               la hora ya empezó en Asia/Kuala_Lumpur
--   invalid            estado, hora o duración no válidos (o cruzaría medianoche)
-- Un solape con otra reserva viva NO es un outcome: es el 23P01 de
-- reservations_no_overlap, que aborta la transacción y la app traduce a 409.

create or replace function public.schedule_package_session(
  p_session_id uuid,
  p_trainer_id uuid,
  p_slot_id uuid,
  p_start_time time,
  p_status text
)
returns table (outcome text, reservation_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.package_sessions%rowtype;
  v_pkg public.client_packages%rowtype;
  v_slot public.availability_slots%rowtype;
  v_linked_status text;
  v_linked_found boolean := false;
  v_duration integer;
  v_end_time time;
  v_label text;
  v_reservation_id uuid;
begin
  if p_status is null or p_status not in ('confirmed', 'pending_confirmation') then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  if p_start_time is null then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- 1. Bloqueo del crédito. Una segunda llamada para la misma sesión espera
  --    aquí hasta que la primera termine y entonces lee la fila ya enlazada.
  select * into v_session
    from public.package_sessions
   where id = p_session_id
     for update;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  select * into v_pkg
    from public.client_packages
   where id = v_session.client_package_id;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_pkg.trainer_id is distinct from p_trainer_id then
    return query select 'forbidden'::text, null::uuid;
    return;
  end if;
  if v_pkg.status <> 'active' then
    return query select 'package_inactive'::text, null::uuid;
    return;
  end if;

  -- 2. ¿Crédito libre? Misma regla que sessionCanBeScheduled / reservationHoldsSlot
  --    (lib/packages/status.ts, lib/availability/slot-status.ts).
  if v_session.status = 'scheduled' then
    if v_session.reservation_id is not null then
      select r.status into v_linked_status
        from public.reservations r
       where r.id = v_session.reservation_id;
      v_linked_found := found;
    end if;
    if v_linked_found
       and lower(trim(coalesce(v_linked_status, ''))) not in ('cancelled', 'canceled', 'needs_reschedule') then
      return query select 'already_scheduled'::text, null::uuid;
      return;
    end if;
  elsif v_session.status <> 'not_scheduled' then
    return query select 'already_scheduled'::text, null::uuid;
    return;
  end if;

  -- 3. Duración y rango. El fin lo fija la duración del paquete (007), no el
  --    llamante. Una clase que cruzaría medianoche no es válida (time +
  --    interval da la vuelta).
  v_duration := coalesce(v_pkg.duration_minutes, 60);
  if v_duration not in (60, 90) then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;
  v_end_time := p_start_time + make_interval(mins => v_duration);
  if v_end_time <= p_start_time then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- 4. La ventana (loadOwnedOpenWindow + isPastMalaysiaSession, aquí dentro).
  --    FOR SHARE: nadie la cierra ni la mueve hasta el COMMIT; dos agendados
  --    en la misma ventana no se bloquean entre sí.
  select * into v_slot
    from public.availability_slots s
   where s.id = p_slot_id
     for share;
  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;
  if v_slot.trainer_id is distinct from p_trainer_id then
    return query select 'forbidden'::text, null::uuid;
    return;
  end if;
  if lower(trim(coalesce(v_slot.status, ''))) in ('pending', 'full', 'cancelled', 'canceled', 'booked', 'unavailable', 'blocked') then
    return query select 'window_closed'::text, null::uuid;
    return;
  end if;
  if p_start_time < v_slot.start_time or v_end_time > v_slot.end_time then
    return query select 'out_of_window'::text, null::uuid;
    return;
  end if;
  if (v_slot.session_date + p_start_time) < date_trunc('minute', now() at time zone 'Asia/Kuala_Lumpur') then
    return query select 'past'::text, null::uuid;
    return;
  end if;

  -- 5. La reserva. Mismas columnas que escribía schedule.ts; los datos del
  --    cliente y el precio salen del paquete (foto fija de la venta). Migración
  --    010: sin jugador (player_id NULL), sin mensaje, 1 jugador, sin WhatsApp.
  --    El solape lo rechaza aquí reservations_no_overlap (23P01).
  v_label := format('Paquete de %s clases · sesión %s/%s', v_pkg.sessions_total, v_session.session_number, v_pkg.sessions_total);

  insert into public.reservations (
    trainer_id, availability_slot_id, client_name, client_email, client_phone,
    notes, price, player_count, whatsapp_opt_in,
    start_time, end_time, duration_minutes, status, created_at
  ) values (
    p_trainer_id, p_slot_id, v_pkg.client_name, v_pkg.client_email, v_pkg.client_phone,
    case when v_pkg.notes is not null and v_pkg.notes <> '' then v_label || ' · ' || v_pkg.notes else v_label end,
    v_pkg.price_per_session_discounted, 1, false,
    p_start_time, v_end_time, v_duration, p_status, now()
  )
  returning id into v_reservation_id;

  -- 6. El enlace, en la misma transacción.
  update public.package_sessions
     set reservation_id = v_reservation_id,
         status = 'scheduled',
         updated_at = now()
   where id = v_session.id;

  return query select 'scheduled'::text, v_reservation_id;
end;
$$;

comment on function public.schedule_package_session(uuid, uuid, uuid, time, text) is
  'Agenda una package_session: bloquea el crédito (FOR UPDATE), comprueba que está libre y la ventana, crea la reserva y la enlaza en una sola transacción. Solo service_role. Migración 017.';

-- ─── Desagendar ─────────────────────────────────────────────────────────────
--
-- p_expected_reservation_id: el reservation_id que vio la app al cargar la
-- sesión (NULL si no tenía). Si al bloquear la fila ya es otro — p. ej. la
-- reserva vista estaba cancelada y otra petición reagendó el crédito entre
-- medias — no se toca nada: cancelar la reserva nueva sería deshacer un
-- agendado que el entrenador no ha visto.
--
-- Devuelve una fila (outcome, cancelled_reservation_id, slot_id):
--   unscheduled    ok; cancelled_reservation_id = la reserva cancelada aquí
--                  (NULL si ya no ocupaba hueco) y slot_id = su ventana, para
--                  recalcularla y avisar después del COMMIT
--   not_found      la sesión o su paquete no existen
--   forbidden      el paquete no es de p_trainer_id
--   not_scheduled  el crédito no está agendado
--   changed        el crédito ya no apunta a p_expected_reservation_id

create or replace function public.unschedule_package_session(
  p_session_id uuid,
  p_trainer_id uuid,
  p_expected_reservation_id uuid
)
returns table (outcome text, cancelled_reservation_id uuid, slot_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.package_sessions%rowtype;
  v_pkg_trainer uuid;
  v_res_status text;
  v_res_slot uuid;
  v_cancelled uuid;
begin
  select * into v_session
    from public.package_sessions
   where id = p_session_id
     for update;
  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  select cp.trainer_id into v_pkg_trainer
    from public.client_packages cp
   where cp.id = v_session.client_package_id;
  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_pkg_trainer is distinct from p_trainer_id then
    return query select 'forbidden'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_session.status <> 'scheduled' then
    return query select 'not_scheduled'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_session.reservation_id is distinct from p_expected_reservation_id then
    return query select 'changed'::text, null::uuid, null::uuid;
    return;
  end if;

  -- Cancelar la reserva enlazada si sigue viva (mismo efecto que
  -- cancelReservation en lib/reservations/edit.ts: status cancelled y, si era
  -- una propuesta, el enlace público deja de valer).
  if v_session.reservation_id is not null then
    select r.status, r.availability_slot_id into v_res_status, v_res_slot
      from public.reservations r
     where r.id = v_session.reservation_id
       for update;
    if found and lower(trim(coalesce(v_res_status, ''))) not in ('cancelled', 'canceled', 'needs_reschedule') then
      update public.reservations
         set status = 'cancelled',
             proposal_token = case when lower(trim(coalesce(status, ''))) = 'reschedule_proposed' then null else proposal_token end,
             updated_at = now()
       where id = v_session.reservation_id;
      v_cancelled := v_session.reservation_id;
    end if;
  end if;

  -- Devolver el crédito, en la misma transacción.
  update public.package_sessions
     set reservation_id = null,
         status = 'not_scheduled',
         updated_at = now()
   where id = v_session.id;

  return query select 'unscheduled'::text, v_cancelled, case when v_cancelled is null then null::uuid else v_res_slot end;
end;
$$;

comment on function public.unschedule_package_session(uuid, uuid, uuid) is
  'Desagenda una package_session: bloquea el crédito (FOR UPDATE), comprueba que sigue enlazado a la reserva esperada, la cancela si está viva y devuelve el crédito en una sola transacción. Solo service_role. Migración 017.';

revoke all on function public.schedule_package_session(uuid, uuid, uuid, time, text) from public;
revoke all on function public.schedule_package_session(uuid, uuid, uuid, time, text) from anon, authenticated;
grant execute on function public.schedule_package_session(uuid, uuid, uuid, time, text) to service_role;

revoke all on function public.unschedule_package_session(uuid, uuid, uuid) from public;
revoke all on function public.unschedule_package_session(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.unschedule_package_session(uuid, uuid, uuid) to service_role;

commit;

notify pgrst, 'reload schema';

-- ─── Comprobaciones (solo lectura, después de aplicar) ──────────────────────
--
-- select p.proname, p.prosecdef as security_definer,
--        has_function_privilege('anon', p.oid, 'execute') as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
--        has_function_privilege('service_role', p.oid, 'execute') as service_exec
--   from pg_proc p
--  where p.proname in ('schedule_package_session', 'unschedule_package_session');
--   → security_definer false, anon_exec false, auth_exec false, service_exec true
--
-- Reservas de paquete huérfanas (vivas y sin crédito que apunte a ellas) que
-- haya podido dejar la carrera anterior:
--
-- select r.id, r.trainer_id, r.session_date, r.start_time, r.status, r.notes
--   from public.reservations r
--  where r.notes like 'Paquete de % clases · sesión %'
--    and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
--    and not exists (select 1 from public.package_sessions ps where ps.reservation_id = r.id);
