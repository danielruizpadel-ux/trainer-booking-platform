-- 021 — Reserva pública idempotente y límite de peticiones compartido
--
-- Requiere 008 (reservations_no_overlap) y 010 (player_count,
-- whatsapp_opt_in, client_message). No depende de 011–020; va después de
-- ellas en la numeración (orden estricto: docs/estado-integracion.md).
--
-- POST /api/reservations (app/api/reservations/route.ts) usa las dos cosas:
--
-- ─── 1. Idempotencia: booking_requests + create_booking_request ────────────
--
-- El navegador manda una clave (cabecera Idempotency-Key, UUID) por intento
-- de reserva y la repite en los reintentos. El servidor la guarda con:
--   scope          de quién es la clave: 'player:<players.id>' (con cuenta,
--                  de la sesión) o 'guest:<sha256 del email>' (invitado).
--                  Una clave solo existe dentro de su scope: la de un cliente
--                  no da acceso al resultado de otro.
--   request_hash   huella de la petición normalizada (sesiones, duración,
--                  jugadores, mensaje, contacto…). Misma clave con otra
--                  huella → se rechaza ('key_reused').
--   response       lo que se respondió (ids de reserva y precios; sin datos
--                  de contacto) para repetirlo tal cual.
--
-- create_booking_request(scope, key, hash, rows, response) hace en UNA
-- transacción: registrar la clave, insertar las reservas y guardar la
-- respuesta. Si algo falla (p. ej. 23P01 de la 008), no queda nada: ni
-- reservas ni clave. Si la respuesta se pierde después del commit, repetir
-- con la misma clave devuelve lo guardado ('replayed') sin crear nada.
-- Dos peticiones a la vez con la misma clave: la segunda espera en el índice
-- único a que la primera termine; si la primera confirmó, recibe su
-- respuesta; si se deshizo, sigue y reserva ella.
--
-- ─── 2. Límite de peticiones: rate_limit_counters + rate_limit_consume ─────
--
-- Contadores por ventana fija en Postgres (compartidos entre instancias del
-- servidor; nada en memoria). rate_limit_consume(buckets, limits, window)
-- suma 1 a cada cubo EN ORDEN de forma atómica (INSERT … ON CONFLICT DO
-- UPDATE) y para en el primero que pasa de su límite: los de después no se
-- tocan (el cupo compartido del entrenador va el último, así que quien ya está
-- bloqueado no lo gasta). Devuelve ese cubo y cuántos segundos faltan para que
-- se abra.
-- Qué cubos se usan (y por qué no una IP de una cabecera cualquiera) lo decide
-- lib/reservations/rate-limit.ts.
--
-- Limpieza: cada llamada, con probabilidad 1/100, borra contadores de hace más
-- de un día y claves de hace más de 7 días. Retención de claves: 7 días.
--
-- Seguridad: tablas con RLS sin políticas y sin GRANT para anon/authenticated;
-- funciones SECURITY INVOKER solo para service_role.
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres). Idempotente. En una
-- transacción. No cambia datos existentes. Después:
--   notify pgrst, 'reload schema';

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'reservations_no_overlap' and conrelid = 'public.reservations'::regclass
  ) then
    raise exception '021 requiere la 008: no existe la restricción reservations_no_overlap';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations' and column_name = 'whatsapp_opt_in'
  ) then
    raise exception '021 requiere la 010: falta reservations.whatsapp_opt_in';
  end if;
end $$;

-- ─── Tablas ─────────────────────────────────────────────────────────────────

create table if not exists public.booking_requests (
  scope text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response jsonb not null,
  reservation_ids uuid[] not null,
  created_at timestamptz not null default now(),
  primary key (scope, idempotency_key)
);
create index if not exists booking_requests_created_idx on public.booking_requests (created_at);
comment on table public.booking_requests is
  'Claves de idempotencia de POST /api/reservations: scope (player:<players.id> | guest:<sha256 email>) + clave → huella de la petición y respuesta guardada. Solo service_role. Migración 021.';

create table if not exists public.rate_limit_counters (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (bucket, window_start)
);
create index if not exists rate_limit_counters_window_idx on public.rate_limit_counters (window_start);
comment on table public.rate_limit_counters is
  'Contadores del límite de peticiones (ventana fija), compartidos entre instancias. Solo service_role. Migración 021.';

alter table public.booking_requests enable row level security;
alter table public.rate_limit_counters enable row level security;
revoke all on public.booking_requests, public.rate_limit_counters from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.booking_requests, public.rate_limit_counters from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.booking_requests, public.rate_limit_counters from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.booking_requests, public.rate_limit_counters to service_role';
  end if;
end $$;

-- ─── Reserva idempotente ────────────────────────────────────────────────────

create or replace function public.create_booking_request(
  p_scope text,
  p_key uuid,
  p_request_hash text,
  p_rows jsonb,
  p_response jsonb
)
returns table (outcome text, response jsonb, reservation_ids uuid[])
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_existing public.booking_requests%rowtype;
  v_ids uuid[];
  v_n integer;
begin
  if p_scope is null or p_scope !~ '^(player|guest):.{8,}$' or p_key is null
     or p_request_hash is null or length(p_request_hash) < 16
     or p_rows is null or jsonb_typeof(p_rows) <> 'array'
     or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 20
     or p_response is null or jsonb_typeof(p_response) <> 'object' then
    raise exception using errcode = '22023', message = 'booking_request_invalid';
  end if;

  if random() < 0.01 then
    delete from booking_requests b where b.created_at < now() - interval '7 days';
  end if;

  -- Registrar la clave. Si otra transacción acaba de registrar la misma,
  -- este INSERT espera a que termine (índice único).
  insert into booking_requests (scope, idempotency_key, request_hash, response, reservation_ids)
  values (p_scope, p_key, p_request_hash, '{}'::jsonb, '{}'::uuid[])
  on conflict (scope, idempotency_key) do nothing;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    select * into v_existing
      from booking_requests b
     where b.scope = p_scope and b.idempotency_key = p_key;
    if v_existing.request_hash is distinct from p_request_hash then
      return query select 'key_reused'::text, null::jsonb, null::uuid[];
      return;
    end if;
    return query select 'replayed'::text, v_existing.response, v_existing.reservation_ids;
    return;
  end if;

  -- Las reservas: mismas columnas que escribe la ruta. Solape → 23P01 (008),
  -- fuera de la ventana → 23514 (015): se deshace todo, también la clave.
  with ins as (
    insert into reservations (
      trainer_id, availability_slot_id, player_id, client_name, client_email, client_phone,
      whatsapp_opt_in, client_message, player_count, start_time, end_time, duration_minutes,
      price, status, created_at
    )
    select r.trainer_id, r.availability_slot_id, r.player_id, r.client_name, r.client_email, r.client_phone,
           r.whatsapp_opt_in, r.client_message, r.player_count, r.start_time, r.end_time, r.duration_minutes,
           r.price, r.status, r.created_at
      from jsonb_to_recordset(p_rows) as r(
        trainer_id uuid, availability_slot_id uuid, player_id uuid, client_name text, client_email text,
        client_phone text, whatsapp_opt_in boolean, client_message text, player_count smallint,
        start_time time, end_time time, duration_minutes smallint, price numeric, status text,
        created_at timestamptz
      )
    returning id
  )
  select array_agg(id) into v_ids from ins;

  update booking_requests b
     set response = p_response || jsonb_build_object('reservationIds', to_jsonb(v_ids)),
         reservation_ids = v_ids
   where b.scope = p_scope and b.idempotency_key = p_key;

  return query select 'created'::text, p_response || jsonb_build_object('reservationIds', to_jsonb(v_ids)), v_ids;
end;
$$;

comment on function public.create_booking_request(text, uuid, text, jsonb, jsonb) is
  'POST /api/reservations: clave de idempotencia + reservas + respuesta en UNA transacción. created | replayed (misma clave y huella) | key_reused (misma clave, otra huella). Solo service_role. Migración 021.';

-- ─── Límite de peticiones ───────────────────────────────────────────────────

create or replace function public.rate_limit_consume(
  p_buckets text[],
  p_limits integer[],
  p_window_seconds integer
)
returns table (allowed boolean, bucket text, retry_after integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_window_start timestamptz;
  v_hits integer;
  v_blocked text;
  v_retry integer;
begin
  if p_buckets is null or p_limits is null or array_length(p_buckets, 1) is null
     or array_length(p_buckets, 1) <> array_length(p_limits, 1)
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception using errcode = '22023', message = 'rate_limit_invalid';
  end if;

  if random() < 0.01 then
    delete from rate_limit_counters c where c.window_start < now() - interval '1 day';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_retry := greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds)) - now()))::integer);

  for i in 1 .. array_length(p_buckets, 1) loop
    insert into rate_limit_counters as c (bucket, window_start, hits)
    values (p_buckets[i], v_window_start, 1)
    on conflict (bucket, window_start) do update set hits = c.hits + 1
    returning c.hits into v_hits;
    if v_hits > p_limits[i] then
      v_blocked := p_buckets[i];
      exit;
    end if;
  end loop;

  if v_blocked is not null then
    return query select false, v_blocked, v_retry;
  else
    return query select true, null::text, 0;
  end if;
end;
$$;

comment on function public.rate_limit_consume(text[], integer[], integer) is
  'Suma 1 a cada cubo, en orden, en la ventana fija actual (atómico, compartido entre instancias); para en el primero que pasa de su límite y devuelve el Retry-After. Solo service_role. Migración 021.';

revoke all on function public.create_booking_request(text, uuid, text, jsonb, jsonb) from public;
revoke all on function public.rate_limit_consume(text[], integer[], integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.create_booking_request(text, uuid, text, jsonb, jsonb) from anon';
    execute 'revoke all on function public.rate_limit_consume(text[], integer[], integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.create_booking_request(text, uuid, text, jsonb, jsonb) from authenticated';
    execute 'revoke all on function public.rate_limit_consume(text[], integer[], integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking_request(text, uuid, text, jsonb, jsonb) to service_role';
    execute 'grant execute on function public.rate_limit_consume(text[], integer[], integer) to service_role';
  end if;
end $$;

commit;
