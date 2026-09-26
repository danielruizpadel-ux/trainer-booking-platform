-- 012b — Un crédito de paquete respalda como mucho UNA reserva viva (R2)
--
-- Requiere la 011 (schedule/unschedule_package_session) y la 012a (tabla de
-- decisiones y vistas de diagnóstico). Lo comprueba el PASO 0 y aborta si falta.
--
-- El problema (R2): el crédito (package_sessions.reservation_id) apuntaba a la
-- reserva ORIGINAL. Al proponer otra fecha (lib/reservations/proposal.ts) la
-- original pasa a needs_reschedule y se crea una fila NUEVA reschedule_proposed
-- sobre otro hueco; el crédito seguía apuntando a la original, ya muerta, así
-- que parecía libre y schedule_package_session creaba una tercera reserva:
-- dos reservas vivas (la propuesta y la nueva) con un solo crédito. Lo mismo
-- al aceptar la propuesta (sigue viva) o al reproponer sobre ella. Y
-- moveReservation puede revivir una reserva muerta (needs_reschedule →
-- pending_confirmation) aunque el crédito ya se haya reutilizado.
--
-- ─── La regla ───────────────────────────────────────────────────────────────
--
--   * Toda reserva que nace de un crédito lleva el crédito en
--     reservations.package_session_id: la que crea schedule_package_session y
--     cada propuesta que se hace sobre ella (se hereda de la original).
--   * "Viva" es reservationHoldsSlot: todo estado salvo cancelled, canceled y
--     needs_reschedule (misma regla que reservations_no_overlap, 008).
--   * Un crédito tiene COMO MUCHO UNA reserva viva: índice único parcial
--     reservations_one_live_per_package_session. Lo garantiza Postgres en
--     cualquier camino (insert, cambio de estado) y con peticiones
--     concurrentes: la segunda falla con 23505 y la app responde 409.
--   * Una reserva de paquete que deja de estar viva no revive (PASO 3b).
--   * El enlace del crédito sigue a la reserva viva: al proponer, el crédito
--     pasa a apuntar a la propuesta, en la misma transacción. Así el panel
--     (sessionHoldsCredit, que mira la reserva enlazada) ve el crédito ocupado
--     mientras la propuesta esté viva.
--   * El crédito queda libre solo cuando no le queda ninguna reserva viva:
--     la propuesta se rechaza (needs_reschedule), se cancela, o el entrenador
--     marca "sin pista" sin proponer. Es la regla de siempre (decisión 2.7):
--     el cliente no pierde la clase.
--
-- Transiciones:
--   proponer    propose_reschedule (nueva, para TODAS las reservas): en una
--               transacción bloquea el crédito (si lo hay) y la original,
--               valida la ventana, pasa la original a needs_reschedule, crea
--               la propuesta con el crédito heredado y reenlaza el crédito.
--               Si algo falla (p. ej. 23P01), la original sigue pendiente —
--               antes se "restauraba" con una segunda escritura que podía fallar.
--   aceptar     reschedule_proposed → pending_confirmation: sigue viva, mismo
--               crédito. Sin cambios en el código.
--   rechazar    → needs_reschedule: deja de estar viva, el crédito queda libre.
--   cancelar    → cancelled: igual.
--   agendar     schedule_package_session: el crédito está libre si su sesión
--               es not_scheduled/scheduled y NO tiene ninguna reserva viva
--               (por package_session_id o por el enlace). La reserva nueva
--               lleva package_session_id.
--   desagendar  unschedule_package_session: cancela TODAS las reservas vivas
--               del crédito (como mucho una, por el índice) y lo devuelve.
--   mover       moveReservation revive una reserva muerta (→ pending_confirmation).
--               En una reserva de paquete no se permite (trigger
--               reservations_package_no_revive, PASO 3b → 409): el crédito
--               se vuelve a usar agendando desde el paquete.
--
-- ─── Integridad de package_session_id ───────────────────────────────────────
--
-- FOREIGN KEY real a package_sessions(id), ON DELETE RESTRICT: un paquete
-- que tiene reservas (vivas o históricas) NO se puede borrar — borrar
-- client_packages hace cascade a package_sessions y la FK lo rechaza con
-- 23503, sin cambiar nada. Con SET NULL sus reservas se quedaban vivas sin
-- crédito, fuera del índice y del trigger de este archivo. Para dejar de usar
-- un paquete se CANCELA (client_packages.status = 'cancelled'): sus reservas
-- conservan el crédito y la protección, y schedule_package_session ya no
-- agenda más (package_inactive). Borrar sigue siendo posible mientras el
-- paquete no tenga ninguna reserva (el rollback de lib/packages/create.ts).
-- Con esta FK hay DOS relaciones entre
-- package_sessions y reservations, y un embed de PostgREST sin pista
-- (`package_sessions ( ..., reservations ( ... ) )`) falla con PGRST201. Por
-- eso lib/packages/queries.ts usa la pista por columna
-- `reservations!reservation_id ( ... )`, que elige la relación de
-- package_sessions.reservation_id y funciona igual ANTES y DESPUÉS de esta
-- migración (probado contra PostgREST v12 local:
-- scripts/verify-package-credit-postgrest.sh). Cualquier embed nuevo entre
-- estas dos tablas tiene que llevar pista.
--
-- ─── Reservas que ya existen: solo con evidencia ────────────────────────────
--
-- ANTES de esta migración hay que aplicar la 012a y revisar su vista
-- public.package_credit_backfill_report (ver la 012a: el conjunto a revisar
-- es ESTRUCTURAL — entrenador con paquetes, creada entre su primer paquete y
-- esta migración — y no depende de notes ni email). Esta migración:
--   * aborta, sin cambiar nada, si la vista tiene alguna fila bloqueante
--     (viva_sin_clasificar, evidencia_contradictoria, resolucion_invalida,
--     credito_con_varias_vivas) y dice cuántas de cada tipo;
--   * guarda el momento del corte (package_credit_cutoff): lo creado después
--     ya no es histórico;
--   * asigna package_session_id SOLO desde public.package_credit_backfill_mapping
--     (enlace, descendencia de propuestas o decisión explícita) y solo cuando
--     la evidencia apunta a exactamente un crédito. Nunca por la etiqueta de
--     notes ni por el email;
--   * comprueba al final, con la misma vista, que no queda ninguna reserva
--     viva del conjunto sin crédito ni decisión;
--   * pone en CUARENTENA (package_credit_quarantine) las reservas MUERTAS del
--     conjunto sin evidencia ni decisión (muerta_sin_clasificar). Un trigger
--     (reservations_legacy_quarantine) impide reactivarlas — moveReservation
--     responde 409 — hasta clasificarlas con
--       select public.classify_legacy_reservation('<reserva>', '<crédito o null>', 'Dani', '<evidencia>');
--     Con crédito, pasa a ser una reserva de paquete muerta (y el trigger
--     reservations_package_no_revive sigue impidiendo reactivarla); con null
--     ("no es de paquete") vuelve a ser una reserva normal y se puede mover.
--     Así una reserva de paquete que nadie detectó (notes y email editados)
--     nunca puede volver a estar viva sin crédito.
--
-- ─── Transición 011 → 012b → código nuevo (OBLIGATORIO) ─────────────────────
--
-- Mientras se aplica esto puede seguir en marcha código ANTIGUO: la RPC
-- schedule_package_session de la 011 (que crea la reserva SIN
-- package_session_id y después enlaza el crédito) y proposeReschedule de
-- antes de R2 (que inserta la propuesta con dos escrituras sueltas, sin
-- crédito). Si una de esas reservas se creara fuera de lo que esta migración
-- revisa, quedaría viva, sin crédito y fuera del informe y de la cuarentena.
--
-- Procedimiento obligatorio:
--   1. 011 y 012a aplicadas; decisiones de la 012a hechas (informe sin filas
--      bloqueantes).
--   2. DETENER LOS ESCRITORES: poner la app en mantenimiento / parar el
--      despliegue que escribe en reservations y package_sessions (web
--      pública, panel, scripts). Es un requisito del procedimiento, no algo
--      que esta migración pueda comprobar por sí sola.
--   3. Aplicar esta migración.
--   4. Desplegar el código de R2.
--   5. Volver a abrir los escritores.
--   6. Comprobar que no queda nada:
--        select * from public.package_credit_integrity_check where bloquea;   -- vacío
--        select problema, count(*) from public.package_credit_backfill_report group by 1;
--      (solo debería quedar muerta_sin_clasificar: la cuarentena). Si la
--      primera devuelve filas, el paso 2 no se cumplió: ver la vista.
--
-- Lo que la migración hace por su cuenta (probado en local con peticiones
-- antiguas en carrera, scripts/verify-package-credit-transition.sh), para
-- que un paso 2 incompleto falle de forma segura en vez de dejar un hueco:
--   * PASO 0: SET LOCAL lock_timeout y LOCK TABLE package_sessions,
--     reservations IN EXCLUSIVE MODE antes de leer nada. Las transacciones
--     que ya estaban escribiendo terminan antes (y sus reservas entran en la
--     revisión); las que empiecen a escribir esperan a que esta termine. Si
--     no consigue el bloqueo en el plazo (escritores activos), ABORTA sin
--     cambiar nada: detén los escritores y vuelve a aplicarla. Las lecturas
--     simples no se bloquean.
--   * El corte es clock_timestamp() tomado DESPUÉS del bloqueo.
--   * PASO 3e: dos triggers para el código antiguo que llegue a ejecutarse
--     después (una llamada a la 011 que quedó esperando el bloqueo sigue con
--     el cuerpo antiguo; o el código antiguo antes del paso 4):
--       - package_sessions_link_carries_credit: al enlazar una reserva a un
--         crédito (package_sessions.reservation_id), la reserva recibe ese
--         package_session_id. Es justo lo que hace la 011 antigua tras su insert.
--       - reservations_inherit_package_credit: una propuesta
--         (rescheduled_from_id) hereda el crédito de su original al insertarse.
--     Con el crédito puesto, el índice rechaza (23505) la reserva si el
--     crédito ya tiene otra viva, y la petición antigua se deshace entera.
--   * La vista package_credit_integrity_check lista lo que no debería existir
--     (reserva enlazada sin su crédito, propuesta sin el crédito de su
--     original, dos vivas por crédito); esta migración aborta si al final
--     tiene filas que bloquean.
-- Lo que NO garantiza sin el paso 2: escritores desconocidos que creen
-- reservas de paquete por otros caminos; que el enlace del crédito siga a la
-- propuesta creada por el proposeReschedule antiguo (la vista lo marca como
-- enlace_desfasado, sin dos vivas); y las reservas NORMALES creadas por
-- transacciones que esperaban el bloqueo pueden aparecer después en el
-- informe como viva_sin_clasificar (clasificarlas: son de después del corte
-- real pero su created_at es anterior).
--
-- Aplicar en Supabase → SQL Editor → Run, siguiendo el procedimiento de
-- arriba. Idempotente. Todo en una transacción.
--
-- ROLLBACK (el código de R2 deja de poder proponer otra fecha):
--   begin;
--   drop function if exists public.propose_reschedule(uuid, uuid, uuid, time, text);
--   drop trigger if exists reservations_package_no_revive on public.reservations;
--   drop trigger if exists reservations_legacy_quarantine on public.reservations;
--   drop trigger if exists package_sessions_link_carries_credit on public.package_sessions;
--   drop trigger if exists reservations_inherit_package_credit on public.reservations;
--   drop function if exists public.package_sessions_link_carries_credit();
--   drop function if exists public.reservations_inherit_package_credit();
--   drop view if exists public.package_credit_integrity_check;
--   drop function if exists public.reservations_legacy_quarantine();
--   drop function if exists public.classify_legacy_reservation(uuid, uuid, text, text);
--   drop table if exists public.package_credit_quarantine;
--   delete from public.package_credit_cutoff;
--   drop function if exists public.reservations_package_no_revive();
--   drop index if exists public.reservations_one_live_per_package_session;
--   drop index if exists public.reservations_package_session_idx;
--   drop view if exists public.package_credit_backfill_report;
--   drop view if exists public.package_credit_backfill_mapping;   -- dependen de la columna
--   alter table public.reservations drop constraint if exists reservations_package_session_id_fkey;
--   alter table public.reservations drop column if exists package_session_id;
--   -- volver a ejecutar la 012a si se quieren recuperar las vistas
--   -- y volver a ejecutar la 011 para recuperar sus versiones de
--   -- schedule/unschedule_package_session
--   commit;
--   notify pgrst, 'reload schema';

begin;

-- ─── PASO 0 — serializar con los escritores, requisitos y datos resueltos ───
--
-- Antes de leer nada: nadie escribe en estas tablas hasta el COMMIT. Si hay
-- escritores que no sueltan, se aborta en vez de esperar (ver el
-- procedimiento de la cabecera).
set local lock_timeout = '10s';
lock table public.package_sessions, public.reservations in exclusive mode;

do $$
declare
  v_summary text;
begin
  if to_regprocedure('public.schedule_package_session(uuid, uuid, uuid, time, text)') is null
     or to_regprocedure('public.unschedule_package_session(uuid, uuid, uuid)') is null then
    raise exception '012b requiere la 011: faltan schedule_package_session / unschedule_package_session';
  end if;
  if to_regclass('public.package_credit_backfill_report') is null
     or to_regclass('public.package_credit_backfill_mapping') is null
     or to_regclass('public.package_credit_resolutions') is null then
    raise exception '012b requiere la 012a: aplica migrations/012a_package_credit_preparation.sql y revisa public.package_credit_backfill_report';
  end if;

  select string_agg(problema || ': ' || n, ', ' order by problema) into v_summary
    from (
      select problema, count(*) as n
        from public.package_credit_backfill_report
       where problema <> 'muerta_sin_clasificar'
       group by problema
    ) x;
  if v_summary is not null then
    raise exception '012b: hay reservas históricas sin resolver (%). Revisa "select * from public.package_credit_backfill_report", decide cada una en public.package_credit_resolutions (ver la 012a) y vuelve a aplicar.', v_summary;
  end if;
end
$$;

-- ─── PASO 1 — columna con FK ────────────────────────────────────────────────

alter table public.reservations
  add column if not exists package_session_id uuid;

alter table public.reservations
  drop constraint if exists reservations_package_session_id_fkey;
alter table public.reservations
  add constraint reservations_package_session_id_fkey
  foreign key (package_session_id) references public.package_sessions (id) on delete restrict;

comment on column public.reservations.package_session_id is
  'Crédito de paquete (package_sessions.id) que respalda esta reserva: la creada al agendar y sus propuestas. FK ON DELETE RESTRICT (un paquete con reservas no se borra: se cancela); los embeds package_sessions→reservations necesitan la pista reservations!reservation_id. Como mucho una reserva viva por crédito. Migración 012b.';

create index if not exists reservations_package_session_idx
  on public.reservations (package_session_id)
  where package_session_id is not null;

-- La vista de la 012a, ahora con la columna como evidencia (misma definición
-- que la rama "columna existe" de la 012a; MANTENER LAS DOS IGUALES). Así el
-- informe no marca como "sin resolver" reservas que la app deje atrás después.
create or replace view public.package_credit_backfill_mapping
with (security_invoker = true) as
with recursive seeds (psid, rid, fuente) as (
  select ps.id, ps.reservation_id, 'enlace'::text
    from public.package_sessions ps
   where ps.reservation_id is not null
  union all
  select pr.package_session_id, pr.reservation_id, 'decision'::text
    from public.package_credit_resolutions pr
  union all
  select r.package_session_id, r.id, 'columna'::text
    from public.reservations r
   where r.package_session_id is not null
), chain (psid, rid, fuente) as (
  select psid, rid, fuente from seeds
  union
  select c.psid, r.id, c.fuente
    from public.reservations r
    join chain c on r.rescheduled_from_id = c.rid
)
select c.rid as reservation_id,
       array_agg(distinct c.psid) filter (where c.psid is not null) as creditos,
       bool_or(c.psid is null) as declarada_sin_paquete,
       array_agg(distinct c.fuente) as fuentes
  from chain c
 group by c.rid;

-- ─── PASO 2 — asignar el crédito a las reservas existentes (solo evidencia) ─

-- El corte: la primera vez que se aplica. Lo creado después no es histórico.
-- clock_timestamp(), no now(): ya con el bloqueo tomado, todo lo committed
-- antes tiene un created_at anterior.
insert into public.package_credit_cutoff (id, applied_at) values (true, clock_timestamp())
on conflict (id) do nothing;

update public.reservations r
   set package_session_id = m.creditos[1]
  from public.package_credit_backfill_mapping m
 where r.id = m.reservation_id
   and cardinality(m.creditos) = 1
   and not m.declarada_sin_paquete
   and r.package_session_id is distinct from m.creditos[1];

-- Comprobación final, con la misma vista (ya con la columna como evidencia):
-- no queda nada bloqueante. Tras el PASO 0 no debería haber nada; si lo hay,
-- algo no cuadra y no se sigue.
do $$
declare
  v_summary text;
begin
  select string_agg(problema || ': ' || n, ', ' order by problema) into v_summary
    from (
      select problema, count(*) as n
        from public.package_credit_backfill_report
       where problema <> 'muerta_sin_clasificar'
       group by problema
    ) x;
  if v_summary is not null then
    raise exception '012b: tras asignar quedan reservas sin resolver (%). Revisa public.package_credit_backfill_report.', v_summary;
  end if;
end
$$;

-- ─── PASO 2b — cuarentena de las muertas sin clasificar ─────────────────────

create table if not exists public.package_credit_quarantine (
  reservation_id uuid primary key references public.reservations (id) on delete cascade,
  captured_at timestamptz not null default now()
);

comment on table public.package_credit_quarantine is
  'Reservas históricas MUERTAS que podrían ser de paquete (entrenador con paquetes, creadas entre su primer paquete y la 012b) sin evidencia ni decisión. No se pueden reactivar (trigger reservations_legacy_quarantine) hasta clasificarlas con classify_legacy_reservation. Migración 012b.';

alter table public.package_credit_quarantine enable row level security;
revoke all on table public.package_credit_quarantine from public, anon, authenticated;

insert into public.package_credit_quarantine (reservation_id)
select reservation_id
  from public.package_credit_backfill_report
 where problema = 'muerta_sin_clasificar'
on conflict (reservation_id) do nothing;

-- El enlace sigue a la reserva viva: si el crédito apunta a una reserva
-- muerta pero tiene otra viva (p. ej. una propuesta pendiente o aceptada),
-- se reenlaza a esa.
update public.package_sessions ps
   set reservation_id = r.id,
       status = 'scheduled',
       updated_at = now()
  from public.reservations r
 where r.package_session_id = ps.id
   and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
   and ps.status in ('scheduled', 'not_scheduled')
   and ps.reservation_id is distinct from r.id;

-- ─── PASO 3 — el índice ─────────────────────────────────────────────────────
--
-- Si aun así hubiera dos vivas por crédito (no debería, lo mira el PASO 0),
-- la creación del índice falla y la transacción entera se deshace.

drop index if exists public.reservations_one_live_per_package_session;
create unique index reservations_one_live_per_package_session
  on public.reservations (package_session_id)
  where package_session_id is not null
    and coalesce(status, '') not in ('cancelled', 'canceled', 'needs_reschedule');

comment on index public.reservations_one_live_per_package_session is
  'Un crédito de paquete respalda como mucho una reserva viva (reservationHoldsSlot). 23505 → la app responde 409. Migración 012b.';

-- ─── PASO 3b — una reserva de paquete muerta no revive ───────────────────────
--
-- moveReservation pone en pending_confirmation una reserva que no ocupaba
-- hueco (cancelled / needs_reschedule). En una reserva de paquete eso
-- "revive" una reserva a la que el crédito puede haber dejado de apuntar
-- (se reagendó, se propuso otra fecha, se desagendó): el índice impide que
-- haya dos vivas, pero la revivida quedaría viva sin que el crédito la
-- enlace, y con una carrera contra unschedule_package_session incluso con el
-- crédito devuelto. Regla: una reserva con package_session_id que ha dejado
-- de estar viva NO vuelve a estarlo. Para usar el crédito otra vez se agenda
-- desde el paquete (una reserva nueva). Solo mira la propia fila: sin
-- bloqueos, sin carreras. Las reservas sin paquete no cambian.
-- La app traduce el error (23514, reservations_package_no_revive) a un 409.

create or replace function public.reservations_package_no_revive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(old.status, '') in ('cancelled', 'canceled', 'needs_reschedule')
     and coalesce(new.status, '') not in ('cancelled', 'canceled', 'needs_reschedule') then
    raise exception 'reservations_package_no_revive: una reserva de paquete cancelada o sin pista no se puede reactivar; agenda la sesión de nuevo desde el paquete'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_package_no_revive on public.reservations;
create trigger reservations_package_no_revive
  before update of status on public.reservations
  for each row
  when (old.package_session_id is not null)
  execute function public.reservations_package_no_revive();

-- ─── PASO 3c — una reserva histórica en cuarentena no revive ────────────────
--
-- Solo mira la propia fila y la tabla de cuarentena (sin notes ni email).
-- La app traduce el error (23514, reservations_legacy_unclassified) a un 409.

create or replace function public.reservations_legacy_quarantine()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(old.status, '') in ('cancelled', 'canceled', 'needs_reschedule')
     and coalesce(new.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
     and exists (select 1 from public.package_credit_quarantine q where q.reservation_id = old.id) then
    raise exception 'reservations_legacy_unclassified: reserva anterior a la 012b pendiente de clasificar (¿era de un paquete?); clasifícala con classify_legacy_reservation antes de reactivarla'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_legacy_quarantine on public.reservations;
create trigger reservations_legacy_quarantine
  before update of status on public.reservations
  for each row
  when (old.package_session_id is null)
  execute function public.reservations_legacy_quarantine();

-- ─── PASO 3d — clasificar una reserva en cuarentena ─────────────────────────
--
--   select public.classify_legacy_reservation('<reserva>', '<package_sessions.id>', 'Dani', '<evidencia externa>');
--   select public.classify_legacy_reservation('<reserva>', null, 'Dani', '<evidencia: reserva web / cobrada aparte>');
--
-- Deja la decisión en package_credit_resolutions (auditoría), asigna el
-- crédito si lo hay y la saca de la cuarentena. Nunca elige un crédito: si
-- hay varios candidatos, decidir exige evidencia externa (ver la 012a).
-- p_decided_by y p_reason quedan como registro de auditoría: aquí solo se
-- comprueba que no estén vacíos, no que la evidencia sea real o correcta
-- (eso es una revisión humana de package_credit_resolutions).
-- Devuelve: classified | not_found | not_quarantined | forbidden (crédito de
-- otro entrenador) | label_requires_credit (lleva la etiqueta de paquete y se
-- declara "no es de paquete") | invalid (falta quién o por qué).

create or replace function public.classify_legacy_reservation(
  p_reservation_id uuid,
  p_package_session_id uuid,
  p_decided_by text,
  p_reason text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_res public.reservations%rowtype;
  v_pkg_trainer uuid;
begin
  if coalesce(trim(p_decided_by), '') = '' or coalesce(trim(p_reason), '') = '' then
    return 'invalid';
  end if;
  -- Mismo orden de bloqueo que las demás funciones: crédito, después reserva.
  if p_package_session_id is not null then
    select cp.trainer_id into v_pkg_trainer
      from public.package_sessions ps
      join public.client_packages cp on cp.id = ps.client_package_id
     where ps.id = p_package_session_id
       for update of ps;
    if not found then
      return 'not_found';
    end if;
  end if;
  select * into v_res from public.reservations r where r.id = p_reservation_id for update;
  if not found then
    return 'not_found';
  end if;
  if not exists (select 1 from public.package_credit_quarantine q where q.reservation_id = p_reservation_id) then
    return 'not_quarantined';
  end if;
  if p_package_session_id is not null and v_pkg_trainer is distinct from v_res.trainer_id then
    return 'forbidden';
  end if;
  if p_package_session_id is null and coalesce(v_res.notes, '') ~ '^Paquete de \d+ clases · sesión \d+/\d+' then
    return 'label_requires_credit';
  end if;

  insert into public.package_credit_resolutions (reservation_id, package_session_id, decided_by, reason)
  values (p_reservation_id, p_package_session_id, trim(p_decided_by), trim(p_reason))
  on conflict (reservation_id) do update
     set package_session_id = excluded.package_session_id,
         decided_by = excluded.decided_by,
         reason = excluded.reason,
         created_at = now();

  -- Está muerta (la cuarentena impide reactivarla), así que asignarle el
  -- crédito no ocupa nada; desde ahora la protege reservations_package_no_revive.
  if p_package_session_id is not null then
    update public.reservations set package_session_id = p_package_session_id where id = p_reservation_id;
  end if;

  delete from public.package_credit_quarantine where reservation_id = p_reservation_id;
  return 'classified';
end;
$$;

comment on function public.classify_legacy_reservation(uuid, uuid, text, text) is
  'Clasifica una reserva histórica en cuarentena: su crédito (con evidencia externa) o NULL = no es de paquete. Deja la decisión en package_credit_resolutions. Solo service_role. Migración 012b.';

revoke all on function public.classify_legacy_reservation(uuid, uuid, text, text) from public;
revoke all on function public.classify_legacy_reservation(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.classify_legacy_reservation(uuid, uuid, text, text) to service_role;

-- ─── PASO 3e — código antiguo durante la transición ─────────────────────────
--
-- Ver "Transición" en la cabecera. Solo actúan cuando falta el crédito: las
-- funciones de esta migración ya lo escriben y para ellas no hacen nada.

create or replace function public.package_sessions_link_carries_credit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Mismo orden de bloqueo que las funciones: la fila del crédito ya está
  -- bloqueada (se está actualizando), después la reserva.
  update public.reservations
     set package_session_id = new.id
   where id = new.reservation_id
     and package_session_id is null;
  return null;
end;
$$;

drop trigger if exists package_sessions_link_carries_credit on public.package_sessions;
create trigger package_sessions_link_carries_credit
  after insert or update of reservation_id on public.package_sessions
  for each row
  when (new.reservation_id is not null)
  execute function public.package_sessions_link_carries_credit();

create or replace function public.reservations_inherit_package_credit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select o.package_session_id into new.package_session_id
    from public.reservations o
   where o.id = new.rescheduled_from_id;
  return new;
end;
$$;

drop trigger if exists reservations_inherit_package_credit on public.reservations;
create trigger reservations_inherit_package_credit
  before insert on public.reservations
  for each row
  when (new.package_session_id is null and new.rescheduled_from_id is not null)
  execute function public.reservations_inherit_package_credit();

-- ─── Comprobación de integridad (para el final y para después del despliegue)

create or replace view public.package_credit_integrity_check
with (security_invoker = true) as
-- reserva enlazada a un crédito que no lleva ese crédito
select 'enlace_sin_credito'::text as problema, true as bloquea,
       r.id as reservation_id, ps.id as package_session_id, r.status,
       'package_sessions.reservation_id apunta a la reserva pero su package_session_id es ' || coalesce(r.package_session_id::text, 'NULL') as detalle
  from public.package_sessions ps
  join public.reservations r on r.id = ps.reservation_id
 where r.package_session_id is distinct from ps.id
union all
-- propuesta sin el crédito de su original
select 'propuesta_sin_credito', true, r.id, o.package_session_id, r.status,
       'propuesta de ' || o.id || ', que respalda el crédito ' || o.package_session_id
  from public.reservations r
  join public.reservations o on o.id = r.rescheduled_from_id
 where o.package_session_id is not null
   and r.package_session_id is distinct from o.package_session_id
union all
-- dos o más vivas por crédito (el índice lo impide; por si se desactivara)
select 'vivas_duplicadas', true, r.id, r.package_session_id, r.status, 'el crédito tiene ' || x.n || ' reservas vivas'
  from public.reservations r
  join (
    select package_session_id, count(*) as n
      from public.reservations
     where package_session_id is not null
       and coalesce(status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
     group by 1
    having count(*) > 1
  ) x on x.package_session_id = r.package_session_id
 where coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
union all
-- aviso: viva con crédito al que el crédito no apunta (p. ej. propuesta del
-- proposeReschedule antiguo). No hay dos vivas; el panel puede mostrar la
-- sesión como libre, pero agendarla da 409.
select 'enlace_desfasado', false, r.id, r.package_session_id, r.status, 'el crédito apunta a ' || coalesce(ps.reservation_id::text, 'NULL')
  from public.reservations r
  join public.package_sessions ps on ps.id = r.package_session_id
 where coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
   and ps.reservation_id is distinct from r.id;

comment on view public.package_credit_integrity_check is
  'Tras la 012b y tras desplegar el código: filas con bloquea = true no deberían existir nunca (reserva enlazada sin su crédito, propuesta sin el crédito de su original, dos vivas por crédito). enlace_desfasado es un aviso. Migración 012b.';

revoke all on public.package_credit_integrity_check from public, anon, authenticated;

do $$
declare
  v_summary text;
begin
  select string_agg(problema || ': ' || n, ', ' order by problema) into v_summary
    from (select problema, count(*) as n from public.package_credit_integrity_check where bloquea group by 1) x;
  if v_summary is not null then
    raise exception '012b: comprobación de integridad (%): ver public.package_credit_integrity_check', v_summary;
  end if;
end
$$;

-- ─── PASO 4 — agendar (sustituye a la de la 011, misma firma) ───────────────
--
-- Cambios respecto a la 011: el crédito está libre solo si no le queda
-- NINGUNA reserva viva (por package_session_id o por el enlace), y la reserva
-- creada lleva package_session_id. Resto idéntico.

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

  -- 1. Bloqueo del crédito: agendar, desagendar y proponer sobre el mismo
  --    crédito se ponen en cola aquí.
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

  -- 2. ¿Crédito libre? Ninguna reserva viva que lo use: ni la enlazada ni
  --    ninguna con su package_session_id (p. ej. una propuesta pendiente).
  if v_session.status not in ('not_scheduled', 'scheduled') then
    return query select 'already_scheduled'::text, null::uuid;
    return;
  end if;
  if exists (
    select 1 from public.reservations r
     where (r.package_session_id = v_session.id or r.id = v_session.reservation_id)
       and lower(trim(coalesce(r.status, ''))) not in ('cancelled', 'canceled', 'needs_reschedule')
  ) then
    return query select 'already_scheduled'::text, null::uuid;
    return;
  end if;

  -- 3. Duración y rango (el fin lo fija el paquete).
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

  -- 4. La ventana.
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

  -- 5. La reserva, con el crédito. Solape → 23P01; crédito con otra viva
  --    (no debería pasar tras el paso 2, pero manda el índice) → 23505.
  v_label := format('Paquete de %s clases · sesión %s/%s', v_pkg.sessions_total, v_session.session_number, v_pkg.sessions_total);

  insert into public.reservations (
    trainer_id, availability_slot_id, client_name, client_email, client_phone,
    notes, price, player_count, whatsapp_opt_in,
    start_time, end_time, duration_minutes, status, created_at, package_session_id
  ) values (
    p_trainer_id, p_slot_id, v_pkg.client_name, v_pkg.client_email, v_pkg.client_phone,
    case when v_pkg.notes is not null and v_pkg.notes <> '' then v_label || ' · ' || v_pkg.notes else v_label end,
    v_pkg.price_per_session_discounted, 1, false,
    p_start_time, v_end_time, v_duration, p_status, now(), v_session.id
  )
  returning id into v_reservation_id;

  -- 6. El enlace.
  update public.package_sessions
     set reservation_id = v_reservation_id,
         status = 'scheduled',
         updated_at = now()
   where id = v_session.id;

  return query select 'scheduled'::text, v_reservation_id;
end;
$$;

-- ─── PASO 5 — desagendar (sustituye a la de la 011, misma firma) ────────────
--
-- Cambio respecto a la 011: cancela TODA reserva viva del crédito (la
-- enlazada y cualquiera con su package_session_id; por el índice, como mucho
-- una), no solo la enlazada. El resto (p_expected_reservation_id, outcomes)
-- es igual.

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
  v_cancelled uuid;
  v_slot uuid;
  v_row record;
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

  -- Cancelar las reservas vivas del crédito (mismo efecto que cancelReservation).
  for v_row in
    select r.id, r.availability_slot_id
      from public.reservations r
     where (r.id = v_session.reservation_id or r.package_session_id = v_session.id)
       and lower(trim(coalesce(r.status, ''))) not in ('cancelled', 'canceled', 'needs_reschedule')
     order by (r.id = v_session.reservation_id) desc, r.created_at
       for update
  loop
    update public.reservations
       set status = 'cancelled',
           proposal_token = case when lower(trim(coalesce(status, ''))) = 'reschedule_proposed' then null else proposal_token end,
           updated_at = now()
     where id = v_row.id;
    if v_cancelled is null then
      v_cancelled := v_row.id;
      v_slot := v_row.availability_slot_id;
    end if;
  end loop;

  update public.package_sessions
     set reservation_id = null,
         status = 'not_scheduled',
         updated_at = now()
   where id = v_session.id;

  return query select 'unscheduled'::text, v_cancelled, v_slot;
end;
$$;

-- ─── PASO 6 — proponer otra fecha (nueva) ───────────────────────────────────
--
-- Sustituye a las escrituras sueltas de proposeReschedule (liberar la
-- original, insertar la propuesta y, si fallaba, "restaurar" la original).
-- Para TODAS las reservas; si la original es de paquete, además hereda el
-- crédito y lo reenlaza a la propuesta, en la misma transacción.
--
-- Orden de bloqueo: primero el crédito (como schedule/unschedule), después la
-- original. Así no hay abrazo mortal con ellas.
--
-- Devuelve una fila (outcome, proposal_id, original_slot_id, session_date, end_time):
--   proposed        ok
--   not_found       la original o la ventana no existen
--   forbidden       la original o la ventana no son de p_trainer_id
--   not_pending     la original no está pendiente de confirmación
--   same_range      la misma franja que la original
--   window_closed / out_of_window / past / invalid   como en schedule_package_session
-- Un solape es 23P01 (reservations_no_overlap) y deshace todo: la original
-- sigue pendiente.

create or replace function public.propose_reschedule(
  p_original_id uuid,
  p_trainer_id uuid,
  p_slot_id uuid,
  p_start_time time,
  p_token text
)
returns table (outcome text, proposal_id uuid, original_slot_id uuid, session_date date, end_time time)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_credit uuid;
  v_orig public.reservations%rowtype;
  v_slot public.availability_slots%rowtype;
  v_duration integer;
  v_end_time time;
  v_proposal uuid;
begin
  if p_start_time is null or p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;

  -- 1. El crédito, si la original es de paquete: bloquearlo antes que la original.
  select r.package_session_id into v_credit
    from public.reservations r
   where r.id = p_original_id;
  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if v_credit is not null then
    perform 1 from public.package_sessions ps where ps.id = v_credit for update;
  end if;

  -- 2. La original, bloqueada; se vuelve a leer ya con el crédito en la mano.
  select * into v_orig
    from public.reservations r
   where r.id = p_original_id
     for update;
  if v_orig.package_session_id is distinct from v_credit then
    -- Cambió entre las dos lecturas (no lo hace ningún camino de la app).
    return query select 'not_pending'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if v_orig.trainer_id is distinct from p_trainer_id then
    return query select 'forbidden'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if lower(trim(coalesce(v_orig.status, ''))) not in ('pending_confirmation', 'pending') then
    return query select 'not_pending'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;

  -- 3. Duración y rango: los de la original.
  v_duration := coalesce(v_orig.duration_minutes, 60);
  if v_duration not in (60, 90) then
    return query select 'invalid'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  v_end_time := p_start_time + make_interval(mins => v_duration);
  if v_end_time <= p_start_time then
    return query select 'invalid'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if p_slot_id = v_orig.availability_slot_id and p_start_time = v_orig.start_time then
    return query select 'same_range'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;

  -- 4. La ventana propuesta (mismas reglas que schedule_package_session).
  select * into v_slot
    from public.availability_slots s
   where s.id = p_slot_id
     for share;
  if not found then
    return query select 'not_found'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if v_slot.trainer_id is distinct from p_trainer_id then
    return query select 'forbidden'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if lower(trim(coalesce(v_slot.status, ''))) in ('pending', 'full', 'cancelled', 'canceled', 'booked', 'unavailable', 'blocked') then
    return query select 'window_closed'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if p_start_time < v_slot.start_time or v_end_time > v_slot.end_time then
    return query select 'out_of_window'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;
  if (v_slot.session_date + p_start_time) < date_trunc('minute', now() at time zone 'Asia/Kuala_Lumpur') then
    return query select 'past'::text, null::uuid, null::uuid, null::date, null::time;
    return;
  end if;

  -- 5. Liberar la original ANTES de insertar: si no, reservations_no_overlap
  --    rechazaría una propuesta que solape con ella (misma ventana media hora
  --    después), y el índice de crédito, la propuesta de una reserva de paquete.
  update public.reservations
     set status = 'needs_reschedule',
         updated_at = now()
   where id = v_orig.id;

  -- 6. La propuesta: fila NUEVA que hereda identidad, datos del checkout y el crédito.
  insert into public.reservations (
    trainer_id, availability_slot_id, client_name, client_email, client_phone,
    notes, price, player_id, client_message, player_count, whatsapp_opt_in,
    start_time, end_time, duration_minutes, status,
    rescheduled_from_id, proposal_token, created_at, package_session_id
  ) values (
    v_orig.trainer_id, p_slot_id, v_orig.client_name, v_orig.client_email, v_orig.client_phone,
    v_orig.notes, v_orig.price, v_orig.player_id, v_orig.client_message, coalesce(v_orig.player_count, 1), v_orig.whatsapp_opt_in,
    p_start_time, v_end_time, v_duration, 'reschedule_proposed',
    v_orig.id, p_token, now(), v_credit
  )
  returning id into v_proposal;

  -- 7. El crédito pasa a apuntar a la propuesta.
  if v_credit is not null then
    update public.package_sessions
       set reservation_id = v_proposal,
           status = 'scheduled',
           updated_at = now()
     where id = v_credit
       and status in ('scheduled', 'not_scheduled');
  end if;

  return query select 'proposed'::text, v_proposal, v_orig.availability_slot_id, v_slot.session_date, v_end_time;
end;
$$;

comment on function public.propose_reschedule(uuid, uuid, uuid, time, text) is
  'Propuesta de nueva fecha en una transacción: original → needs_reschedule, propuesta reschedule_proposed (hereda el crédito de paquete si lo hay) y el crédito pasa a apuntar a la propuesta. Solo service_role. Migración 012b.';

revoke all on function public.propose_reschedule(uuid, uuid, uuid, time, text) from public;
revoke all on function public.propose_reschedule(uuid, uuid, uuid, time, text) from anon, authenticated;
grant execute on function public.propose_reschedule(uuid, uuid, uuid, time, text) to service_role;

-- create or replace conserva los permisos de la 011; se repiten por claridad.
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
-- select * from public.package_credit_backfill_report;          -- sin filas bloqueantes
-- select count(*) from public.reservations r
--  where r.package_session_id is not null
--    and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
--  group by r.package_session_id having count(*) > 1;           -- vacío
