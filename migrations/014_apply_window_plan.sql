-- 014 — Sincronizar ventanas con el horario semanal en UNA transacción
--
-- Requiere 005 (generated_by_pattern), 008 y 013 (FK de reservations con
-- ON DELETE RESTRICT: sin ella, un DELETE aquí podría llevarse reservas).
-- Numeración: ver docs/estado-integracion.md (choque con pagos-paquetes).
--
-- El generador (lib/availability/generate.ts) calcula qué hay que cambiar
-- (plan) y antes lo aplicaba en cinco escrituras separadas: INSERT → DELETE →
-- UPDATE fin → CLOSE → REOPEN. Si una fallaba, las anteriores se quedaban: p.
-- ej. ventanas nuevas creadas y las que el entrenador quitó sin borrar ni
-- cerrar, es decir, horas retiradas PUBLICADAS hasta la siguiente
-- sincronización correcta. Reordenar solo cambia de lado el fallo (y un paso
-- por lotes o una a una puede quedarse a medias igual); además el plan se
-- calcula sobre una lectura que puede haberse quedado vieja.
--
-- apply_window_plan(trainer, plan) aplica el plan entero en una transacción:
--
--   * pg_advisory_xact_lock por entrenador: dos sincronizaciones del mismo
--     entrenador van una detrás de otra.
--   * SELECT … FOR UPDATE de todas las ventanas que toca el plan (en orden
--     de id). Una reserva que se esté creando en una de ellas (tiene un
--     FOR KEY SHARE) hace esperar; una que llegue después espera a que esto
--     termine y, si su ventana se ha borrado, la base la rechaza (23503).
--   * Se revalida con las filas bloqueadas, no con lo que leyó la app:
--       delete     si la ventana tiene CUALQUIER reserva → se cierra
--                  (`blocked`) en vez de borrarse (`kept`).
--       update_end si alguna reserva viva quedaría fuera del nuevo rango → se
--                  cierra en vez de acortarse (`shrink_blocked`).
--       insert     ON CONFLICT DO NOTHING (otra sincronización ya la creó).
--       Una fila que ya no existe se salta (`missing`).
--   * Solo filas del entrenador y del generador (generated_by_pattern): una
--     fila ajena o manual en el plan → error (el plan lo calcula el servidor;
--     esto es defensa).
--   * CUALQUIER error (un 23503 de otra FK, un trigger, la red…) deshace
--     toda la transacción: la disponibilidad publicada queda exactamente
--     como estaba antes de sincronizar.
--
-- plan (jsonb):
--   { "insert":     [{ "session_date", "start_time", "end_time", "class_type" }],
--     "delete":     [uuid], "update_end": [{ "id", "end_time" }],
--     "close":      [uuid], "reopen":     [uuid] }
-- Devuelve jsonb: { created, removed, kept, closed, shrink_blocked, reopened, missing }.
--
-- Solo service_role. Aplicar en Supabase → SQL Editor → Run (como postgres),
-- después de la 013. Idempotente. En una transacción. Después:
--   notify pgrst, 'reload schema';

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.reservations'::regclass
       and confrelid = 'public.availability_slots'::regclass
       and contype = 'f' and confdeltype = 'r'
  ) then
    raise exception '014 requiere la 013: la FK de reservations a availability_slots no es ON DELETE RESTRICT';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'availability_slots' and column_name = 'generated_by_pattern'
  ) then
    raise exception '014 requiere la 005: falta availability_slots.generated_by_pattern';
  end if;
end $$;

create or replace function public.apply_window_plan(p_trainer_id uuid, p_plan jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids uuid[];
  v_locked integer;
  v_foreign integer;
  v_row record;
  v_item jsonb;
  v_created integer := 0;
  v_removed integer := 0;
  v_kept integer := 0;
  v_closed integer := 0;
  v_shrink_blocked integer := 0;
  v_reopened integer := 0;
  v_missing integer := 0;
  v_n integer;
  v_live constant text[] := array['cancelled', 'canceled', 'needs_reschedule'];
begin
  if p_trainer_id is null or p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception using errcode = '22023', message = 'window_plan_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('window_plan:' || p_trainer_id::text, 0));

  -- Todas las filas que toca el plan, bloqueadas en orden (sin interbloqueos).
  select coalesce(array_agg(distinct x), '{}') into v_ids
    from (
      select jsonb_array_elements_text(coalesce(p_plan->'delete', '[]'))::uuid as x
      union all select jsonb_array_elements_text(coalesce(p_plan->'close', '[]'))::uuid
      union all select jsonb_array_elements_text(coalesce(p_plan->'reopen', '[]'))::uuid
      union all select (e->>'id')::uuid from jsonb_array_elements(coalesce(p_plan->'update_end', '[]')) e
    ) ids;

  select count(*), count(*) filter (where s.trainer_id <> p_trainer_id or s.generated_by_pattern is distinct from true)
    into v_locked, v_foreign
    from (select * from availability_slots where id = any(v_ids) order by id for update) s;
  if v_foreign > 0 then
    raise exception using errcode = '42501', message = 'window_plan_foreign_row';
  end if;

  -- 1. Cerrar (día apagado con reserva, historial…).
  update availability_slots s
     set status = 'blocked', updated_at = now()
   where s.id in (select jsonb_array_elements_text(coalesce(p_plan->'close', '[]'))::uuid)
     and s.status is distinct from 'blocked';
  get diagnostics v_n = row_count;
  v_closed := v_closed + v_n;

  -- 2. Borrar solo las que, bloqueadas, no tienen ninguna reserva; las demás se cierran.
  for v_row in
    select s.id, s.status,
           exists (select 1 from reservations r where r.availability_slot_id = s.id) as referenced
      from availability_slots s
     where s.id in (select jsonb_array_elements_text(coalesce(p_plan->'delete', '[]'))::uuid)
     order by s.id
  loop
    if v_row.referenced then
      update availability_slots set status = 'blocked', updated_at = now() where id = v_row.id and status is distinct from 'blocked';
      v_kept := v_kept + 1;
    else
      delete from availability_slots where id = v_row.id;
      v_removed := v_removed + 1;
    end if;
  end loop;

  -- 3. Nuevo fin; si dejaría fuera una reserva viva, se cierra en vez de acortarse.
  for v_item in select * from jsonb_array_elements(coalesce(p_plan->'update_end', '[]'))
  loop
    select s.id, s.start_time into v_row from availability_slots s where s.id = (v_item->>'id')::uuid;
    if not found then
      v_missing := v_missing + 1;
      continue;
    end if;
    if exists (
      select 1 from reservations r
       where r.availability_slot_id = v_row.id
         and coalesce(r.status, '') <> all (v_live)
         and (r.end_time > (v_item->>'end_time')::time or r.start_time < v_row.start_time)
    ) then
      update availability_slots set status = 'blocked', updated_at = now() where id = v_row.id;
      v_shrink_blocked := v_shrink_blocked + 1;
    else
      update availability_slots set end_time = (v_item->>'end_time')::time, updated_at = now() where id = v_row.id;
    end if;
  end loop;

  -- 4. Ventanas nuevas (ya existentes → nada).
  insert into availability_slots
    (trainer_id, session_date, start_time, end_time, class_type, status, current_bookings, max_capacity, generated_by_pattern, created_at)
  select p_trainer_id, (e->>'session_date')::date, (e->>'start_time')::time, (e->>'end_time')::time,
         coalesce(e->>'class_type', 'private'), 'available', 0, 1, true, now()
    from jsonb_array_elements(coalesce(p_plan->'insert', '[]')) e
  on conflict do nothing;
  get diagnostics v_created = row_count;

  -- 5. Reabrir las que el patrón vuelve a querer (refreshAllWindows decide luego available/full).
  update availability_slots s
     set status = 'available', updated_at = now()
   where s.id in (select jsonb_array_elements_text(coalesce(p_plan->'reopen', '[]'))::uuid)
     and s.status = 'blocked';
  get diagnostics v_reopened = row_count;

  v_missing := v_missing + (coalesce(array_length(v_ids, 1), 0) - v_locked);

  return jsonb_build_object(
    'created', v_created, 'removed', v_removed, 'kept', v_kept, 'closed', v_closed,
    'shrink_blocked', v_shrink_blocked, 'reopened', v_reopened, 'missing', greatest(v_missing, 0)
  );
end;
$$;

comment on function public.apply_window_plan(uuid, jsonb) is
  'Aplica en UNA transacción el plan del generador semanal (cerrar, borrar sin reservas, nuevo fin, insertar, reabrir), revalidando con las filas bloqueadas. Si algo falla no cambia nada. Solo service_role. Migración 014.';

revoke all on function public.apply_window_plan(uuid, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.apply_window_plan(uuid, jsonb) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.apply_window_plan(uuid, jsonb) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_window_plan(uuid, jsonb) to service_role';
  end if;
end $$;

commit;
