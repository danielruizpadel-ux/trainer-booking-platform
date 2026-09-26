-- 016 — Un plan de sincronización calculado con un horario viejo no se aplica
--
-- Requiere 005 (horario semanal y excepciones) y 014 (apply_window_plan).
-- Numeración: ver docs/estado-integracion.md (choque con pagos-paquetes).
--
-- La 014 aplica el plan del generador en una transacción, pero el plan se
-- calcula antes, en la app, leyendo el horario. Secuencia problemática
-- (revisión de Codex):
--   A lee el horario y calcula su plan
--   B guarda un cambio de horario y sincroniza (plan nuevo aplicado)
--   A aplica su plan → se vuelve al horario de antes de B
--
-- Solución: una revisión persistida del horario de cada entrenador.
--   * trainers.availability_revision (bigint, 0 de partida).
--   * Triggers en trainer_weekly_hours y trainer_availability_overrides:
--     cualquier INSERT/UPDATE/DELETE la sube (en la misma transacción que
--     el cambio), sea cual sea el camino que escriba.
--   * El generador lee la revisión ANTES de leer el horario y la manda con el
--     plan. apply_window_plan(trainer, plan, revision) — con el cerrojo del
--     entrenador ya cogido — bloquea la fila del entrenador FOR SHARE y
--     compara: si no coincide, 'window_plan_stale' y no aplica nada.
--     (Si el horario cambia entre leer la revisión y leer el horario, el plan
--     también se rechaza: falso positivo seguro, la app reintenta.)
--   * Se borra la versión sin revisión (uuid, jsonb) de la 014: nadie puede
--     aplicar un plan sin decir con qué horario se calculó.
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres), después de la 014.
-- Idempotente. En una transacción; solo añade la columna (0) y cambia la
-- función. Después: notify pgrst, 'reload schema';

begin;

do $$
begin
  if to_regprocedure('public.apply_window_plan(uuid, jsonb)') is null
     and to_regprocedure('public.apply_window_plan(uuid, jsonb, bigint)') is null then
    raise exception '016 requiere la 014: no existe apply_window_plan';
  end if;
  if to_regclass('public.trainer_weekly_hours') is null or to_regclass('public.trainer_availability_overrides') is null then
    raise exception '016 requiere la 005: faltan trainer_weekly_hours / trainer_availability_overrides';
  end if;
end $$;

alter table public.trainers
  add column if not exists availability_revision bigint not null default 0;

comment on column public.trainers.availability_revision is
  'Revisión del horario (semanal + excepciones). La suben los triggers de trainer_weekly_hours y trainer_availability_overrides; apply_window_plan rechaza un plan calculado con otra. Migración 016.';

create or replace function public.bump_availability_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update trainers set availability_revision = availability_revision + 1 where id = old.trainer_id;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.trainer_id is distinct from old.trainer_id) then
    update trainers set availability_revision = availability_revision + 1 where id = new.trainer_id;
  end if;
  return null;
end;
$$;

drop trigger if exists bump_availability_revision on public.trainer_weekly_hours;
create trigger bump_availability_revision
  after insert or update or delete on public.trainer_weekly_hours
  for each row execute function public.bump_availability_revision();

drop trigger if exists bump_availability_revision on public.trainer_availability_overrides;
create trigger bump_availability_revision
  after insert or update or delete on public.trainer_availability_overrides
  for each row execute function public.bump_availability_revision();

drop function if exists public.apply_window_plan(uuid, jsonb);

create or replace function public.apply_window_plan(p_trainer_id uuid, p_plan jsonb, p_revision bigint)
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
  v_revision bigint;
begin
  if p_trainer_id is null or p_plan is null or jsonb_typeof(p_plan) <> 'object' or p_revision is null then
    raise exception using errcode = '22023', message = 'window_plan_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('window_plan:' || p_trainer_id::text, 0));

  -- El plan se calculó con el horario de la revisión p_revision. FOR SHARE:
  -- una escritura de horario en curso (que va a subir la revisión) hace
  -- esperar, y ninguna nueva puede subirla hasta que esto termine.
  select t.availability_revision into v_revision
    from trainers t
   where t.id = p_trainer_id
     for share;
  if not found then
    raise exception using errcode = '22023', message = 'window_plan_invalid';
  end if;
  if v_revision <> p_revision then
    raise exception using
      errcode = 'P0001',
      message = 'window_plan_stale',
      detail = format('plan calculado con la revisión %s; la vigente es %s', p_revision, v_revision);
  end if;

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


comment on function public.apply_window_plan(uuid, jsonb, bigint) is
  'Aplica en UNA transacción el plan del generador semanal si se calculó con la revisión vigente del horario (si no, window_plan_stale). Revalida con las filas bloqueadas. Si algo falla no cambia nada. Solo service_role. Migraciones 014 y 016.';

revoke all on function public.apply_window_plan(uuid, jsonb, bigint) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.apply_window_plan(uuid, jsonb, bigint) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.apply_window_plan(uuid, jsonb, bigint) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.apply_window_plan(uuid, jsonb, bigint) to service_role';
  end if;
end $$;

commit;
