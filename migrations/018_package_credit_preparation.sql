-- 018 — Preparación de la 019: qué reservas existentes respalda cada crédito
--
-- Requiere 004 (rescheduled_from_id) y 006 (paquetes). No cambia ningún dato
-- de reservas ni de paquetes: crea dos tablas (decisiones y corte) y dos
-- vistas de solo lectura. La 019 se niega a aplicarse mientras la vista de
-- problemas tenga filas bloqueantes.
--
-- Por qué: la 019 da a cada reserva de paquete su crédito
-- (reservations.package_session_id), un índice que impide dos vivas por
-- crédito y un trigger que impide reactivar una reserva de paquete muerta.
-- Una reserva de paquete que se quedara SIN crédito quedaría fuera de las dos
-- protecciones, y asignar créditos "por parecido" (la etiqueta de notes, el
-- email) sería suponer.
--
-- ─── Qué se asigna: solo con EVIDENCIA ─────────────────────────────────────
--
--   - el enlace: package_sessions.reservation_id apunta a la reserva;
--   - la descendencia: la reserva es una propuesta (rescheduled_from_id, a
--     cualquier profundidad) de una reserva con crédito;
--   - una DECISIÓN explícita en package_credit_resolutions (y sus propuestas
--     descendientes);
--   - tras la 019, reservations.package_session_id.
--
-- ─── Qué hay que revisar: criterio ESTRUCTURAL, no texto ───────────────────
--
-- notes y email son editables: una reserva de paquete con los dos cambiados
-- no se parece a nada (revisión v3 de Codex). Por eso la seguridad NO
-- depende de ellos. El conjunto a revisar es:
--
--   toda reserva, viva o muerta, SIN evidencia ni decisión, de un entrenador
--   que tiene al menos un paquete, creada DESPUÉS de su primer paquete
--   (client_packages.created_at) y ANTES de aplicar la 019.
--
-- Una reserva de paquete solo puede nacer así: la crea
-- schedule_package_session (o una propuesta sobre ella) con el entrenador del
-- paquete y después de venderlo. Lo que queda fuera (reservas de
-- entrenadores sin paquetes, o anteriores a su primer paquete) no puede ser
-- de paquete. Si created_at es NULL, la reserva entra (conservador). Las
-- creadas después de la 019 no entran: las de paquete ya nacen con crédito.
-- notes y email se usan SOLO como pistas (columnas candidatos y detalle).
--
--   * VIVAS del conjunto → viva_sin_clasificar, BLOQUEA la 019: hay que
--     decidir cada una (su crédito, o "no es de paquete").
--   * MUERTAS del conjunto → muerta_sin_clasificar, NO bloquea: la 019 las
--     pone en CUARENTENA (package_credit_quarantine) y un trigger impide
--     reactivarlas (moveReservation) hasta clasificarlas con
--     public.classify_legacy_reservation(...). Se pueden clasificar antes
--     (aquí, con package_credit_resolutions) o después, cuando haga falta
--     mover una. Así una reserva de paquete no detectada nunca puede volver
--     a estar viva sin crédito.
--
-- ─── Trabajo manual y volumen ──────────────────────────────────────────────
--
-- Antes de la 019: una decisión por cada viva_sin_clasificar, más las
-- filas de evidencia_contradictoria / resolucion_invalida /
-- credito_con_varias_vivas. En la práctica, las vivas del conjunto son las
-- reservas futuras de los entrenadores con paquetes, creadas desde su primer
-- paquete, que no son de paquete (reservas web, manuales): casi todas serán
-- "no es de paquete". Las muertas no hay que decidirlas antes; solo si
-- alguien quiere reactivar una concreta más tarde. Volumen:
--
--   select problema, count(*) from public.package_credit_backfill_report group by 1 order by 1;
--   select trainer_id, problema, count(*) from public.package_credit_backfill_report group by 1, 2 order by 1, 2;
--
-- ─── Decisiones: nunca por suposición ──────────────────────────────────────
--
--   -- es la sesión X de un paquete:
--   insert into public.package_credit_resolutions (reservation_id, package_session_id, decided_by, reason)
--   values ('<reserva>', '<package_sessions.id>', 'Dani', '<evidencia externa: pago / mensaje / agenda>');
--   -- no es de paquete (reserva web, manual…):
--   insert into public.package_credit_resolutions (reservation_id, package_session_id, decided_by, reason)
--   values ('<reserva>', null, 'Dani', '<evidencia externa: cobrada aparte / reserva web>');
--
--   * `candidatos` y `detalle` son PISTAS sacadas de notes/email: pueden
--     faltar o estar mal. No se aplican solas.
--   * Si hay VARIOS créditos candidatos (p. ej. dos paquetes de 10 del mismo
--     cliente), elegir uno exige EVIDENCIA EXTERNA a esta base de datos
--     (el pago, la conversación con el cliente, la agenda del entrenador).
--     La migración valida entrenador, contradicciones y dos vivas por
--     crédito, pero NO puede saber si la elección humana es la correcta: el
--     `reason` debe decir en qué evidencia se basa, para poder auditarla.
--   * REQUISITO DE AUDITORÍA: decided_by y reason son el registro de quién
--     decidió y con qué evidencia. La base de datos solo comprueba que no
--     estén vacíos; NO puede verificar que la evidencia exista ni que sea
--     cierta. Esa verificación es una revisión humana, fuera de SQL, de las
--     filas de package_credit_resolutions (sobre todo las elegidas entre
--     varios candidatos).
--   * Una reserva con la etiqueta "Paquete de N clases · sesión k/N" en
--     notes no se puede declarar "no es de paquete" (esa etiqueta solo la
--     escribe el flujo de paquetes): hay que elegir su crédito.
--   * Un crédito con dos reservas vivas se resuelve cancelando la que sobra.
--
-- Tipos de fila (columna `problema`):
--   viva_sin_clasificar         viva, del conjunto a revisar, sin evidencia ni decisión   BLOQUEA
--   muerta_sin_clasificar       muerta, del conjunto, sin evidencia ni decisión:
--                               la 019 la pone en cuarentena (no se reactiva)        no bloquea
--   evidencia_contradictoria    la evidencia apunta a más de un crédito, o a un
--                               crédito y a "no es de paquete" a la vez                 BLOQUEA
--   resolucion_invalida         la decisión apunta a un crédito de otro entrenador, o
--                               declara "no es de paquete" una reserva con etiqueta     BLOQUEA
--   credito_con_varias_vivas    un crédito respaldaría dos o más reservas vivas         BLOQUEA
--
-- Seguridad: las tablas y las vistas no se exponen a anon/authenticated (se
-- revocan los GRANT por defecto de Supabase; las tablas llevan RLS sin
-- políticas y las vistas son security_invoker). Solo el SQL Editor / service_role.
--
-- ROLLBACK (antes de la 019; después, la 019 depende de las vistas):
--   drop view if exists public.package_credit_backfill_report;
--   drop view if exists public.package_credit_backfill_mapping;
--   drop table if exists public.package_credit_resolutions;
--   drop table if exists public.package_credit_cutoff;

begin;

do $$
begin
  if to_regclass('public.package_sessions') is null or to_regclass('public.client_packages') is null then
    raise exception '018 requiere la 006: faltan client_packages / package_sessions';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations' and column_name = 'rescheduled_from_id'
  ) then
    raise exception '018 requiere la 004: falta reservations.rescheduled_from_id';
  end if;
end
$$;

-- ─── Decisiones explícitas ─────────────────────────────────────────────────

create table if not exists public.package_credit_resolutions (
  reservation_id uuid primary key references public.reservations (id) on delete cascade,
  -- NULL = "esta reserva NO es de paquete" (decisión explícita, no un hueco)
  package_session_id uuid references public.package_sessions (id) on delete cascade,
  decided_by text not null check (length(trim(decided_by)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.package_credit_resolutions is
  'Decisiones explícitas para la 019: qué crédito (package_sessions.id) respalda una reserva histórica, o NULL si no es de paquete. Solo se rellena a mano desde el SQL Editor. Migración 018.';

alter table public.package_credit_resolutions enable row level security;
revoke all on table public.package_credit_resolutions from public, anon, authenticated;

-- ─── Corte: cuándo se aplicó la 019 ───────────────────────────────────────
--
-- Una fila, la escribe la 019 la primera vez. Las reservas creadas después
-- no son históricas (las de paquete ya nacen con crédito) y no se revisan.

create table if not exists public.package_credit_cutoff (
  id boolean primary key default true check (id),
  applied_at timestamptz not null
);

comment on table public.package_credit_cutoff is
  'Momento en que se aplicó la 019 (una sola fila). Las reservas creadas después no entran en la revisión de reservas históricas. Migración 018.';

alter table public.package_credit_cutoff enable row level security;
revoke all on table public.package_credit_cutoff from public, anon, authenticated;

-- ─── Mapa con evidencia: reserva → crédito ─────────────────────────────────
--
-- Una fila por reserva alcanzada por alguna evidencia. `creditos` son los
-- créditos distintos a los que apunta; `declarada_sin_paquete` si alguna
-- decisión (o la de un antecesor) dice "no es de paquete".

-- Si la 019 ya está aplicada, reservations.package_session_id también es
-- evidencia (la escriben las funciones de la 017/019). Sin ella, una reserva
-- que la app dejó atrás después (la antigua de un crédito reagendado) saldría
-- como "sin resolver". La columna puede no existir todavía: por eso la vista
-- se crea con SQL dinámico. La 019 la redefine igual tras crear la columna
-- (MANTENER LAS DOS VERSIONES IGUALES).
do $$
declare
  v_column_seed text := '';
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reservations' and column_name = 'package_session_id'
  ) then
    v_column_seed := $s$
  union all
  select r.package_session_id, r.id, 'columna'::text
    from public.reservations r
   where r.package_session_id is not null$s$;
  end if;
  execute $v$
create or replace view public.package_credit_backfill_mapping
with (security_invoker = true) as
with recursive seeds (psid, rid, fuente) as (
  select ps.id, ps.reservation_id, 'enlace'::text
    from public.package_sessions ps
   where ps.reservation_id is not null
  union all
  select pr.package_session_id, pr.reservation_id, 'decision'::text
    from public.package_credit_resolutions pr$v$ || v_column_seed || $v$
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
 group by c.rid$v$;
end
$$;

comment on view public.package_credit_backfill_mapping is
  'Reserva → crédito con evidencia (enlace, descendencia de propuestas, decisión explícita y, tras la 019, reservations.package_session_id). La 019 asigna package_session_id solo desde aquí y solo si hay exactamente un crédito. Migración 018.';

-- ─── Problemas ─────────────────────────────────────────────────────────────

create or replace view public.package_credit_backfill_report
with (security_invoker = true) as
with first_package as (
  select cp.trainer_id, min(cp.created_at) as since
    from public.client_packages cp
   group by cp.trainer_id
), cutoff as (
  select coalesce((select c.applied_at from public.package_credit_cutoff c), 'infinity'::timestamptz) as t
), mapped as (
  select m.*, cardinality(coalesce(m.creditos, '{}')) as n
    from public.package_credit_backfill_mapping m
), review as (
  -- El conjunto a revisar: ESTRUCTURAL (entrenador con paquetes, fechas),
  -- nada de notes/email.
  select r.*,
         coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule') as viva,
         (regexp_match(coalesce(r.notes, ''), '^Paquete de (\d+) clases · sesión (\d+)/\d+')) as etiqueta
    from public.reservations r
    join first_package f on f.trainer_id = r.trainer_id
   where (r.created_at is null or r.created_at >= f.since)
     and (r.created_at is null or r.created_at < (select t from cutoff))
     and not exists (select 1 from mapped m where m.reservation_id = r.id)
), hinted as (
  -- Pistas (pueden faltar o estar mal): etiqueta y/o email.
  select v.*,
         array(
           select ps.id
             from public.client_packages cp
             join public.package_sessions ps on ps.client_package_id = cp.id
            where cp.trainer_id = v.trainer_id
              and (
                (v.etiqueta is not null and cp.sessions_total = v.etiqueta[1]::int and ps.session_number = v.etiqueta[2]::int)
                or (v.etiqueta is null and lower(cp.client_email) = lower(v.client_email))
              )
            order by cp.created_at, ps.session_number
         ) as candidatos,
         exists (
           select 1 from public.client_packages cp
            where cp.trainer_id = v.trainer_id and lower(cp.client_email) = lower(v.client_email)
         ) as email_de_paquete
    from review v
)
-- viva_sin_clasificar / muerta_sin_clasificar
select case when h.viva then 'viva_sin_clasificar' else 'muerta_sin_clasificar' end as problema,
       h.id as reservation_id, null::uuid as package_session_id,
       h.status, h.trainer_id, h.client_email, h.availability_slot_id, h.start_time, h.notes,
       h.candidatos,
       concat_ws(' · ',
         case
           when h.etiqueta is not null then 'pista: etiqueta de paquete en notes'
           when h.email_de_paquete then 'pista: email de un paquete de este entrenador'
           else 'sin pistas: ni notes ni email la relacionan con un paquete (puede ser una reserva normal, o de paquete con los dos campos editados)'
         end,
         case when cardinality(h.candidatos) > 1
              then cardinality(h.candidatos) || ' créditos candidatos: elegir uno exige evidencia externa (pago, conversación, agenda)'
         end,
         case when not h.viva then 'no bloquea: la 019 la pone en cuarentena hasta clasificarla' end
       ) as detalle
  from hinted h
union all
-- evidencia_contradictoria
select 'evidencia_contradictoria', r.id, null, r.status, r.trainer_id, r.client_email, r.availability_slot_id, r.start_time, r.notes,
       coalesce(m.creditos, '{}'),
       'fuentes: ' || array_to_string(m.fuentes, ', ') ||
       case when m.declarada_sin_paquete then '; declarada "no es de paquete"' else '' end
  from mapped m
  join public.reservations r on r.id = m.reservation_id
 where m.n > 1 or (m.n >= 1 and m.declarada_sin_paquete)
union all
-- resolucion_invalida: el crédito es de un paquete de otro entrenador
select 'resolucion_invalida', r.id, pr.package_session_id, r.status, r.trainer_id, r.client_email, r.availability_slot_id, r.start_time, r.notes,
       array[pr.package_session_id],
       'el crédito es de un paquete del entrenador ' || cp.trainer_id
  from public.package_credit_resolutions pr
  join public.reservations r on r.id = pr.reservation_id
  join public.package_sessions ps on ps.id = pr.package_session_id
  join public.client_packages cp on cp.id = ps.client_package_id
 where cp.trainer_id is distinct from r.trainer_id
union all
-- resolucion_invalida: "no es de paquete" para una reserva con etiqueta de paquete
select 'resolucion_invalida', r.id, null, r.status, r.trainer_id, r.client_email, r.availability_slot_id, r.start_time, r.notes,
       '{}'::uuid[],
       'lleva la etiqueta de paquete en notes: no se puede declarar "no es de paquete"; elige su crédito'
  from public.package_credit_resolutions pr
  join public.reservations r on r.id = pr.reservation_id
 where pr.package_session_id is null
   and r.notes ~ '^Paquete de \d+ clases · sesión \d+/\d+'
union all
-- credito_con_varias_vivas (solo con asignaciones inequívocas)
select 'credito_con_varias_vivas', r.id, m.creditos[1], r.status, r.trainer_id, r.client_email, r.availability_slot_id, r.start_time, r.notes,
       m.creditos,
       'el crédito respaldaría ' || x.vivas || ' reservas vivas: cancela las que sobren'
  from mapped m
  join public.reservations r on r.id = m.reservation_id
  join (
    select m2.creditos[1] as psid, count(*) as vivas
      from mapped m2
      join public.reservations r2 on r2.id = m2.reservation_id
     where m2.n = 1 and not m2.declarada_sin_paquete
       and coalesce(r2.status, '') not in ('cancelled', 'canceled', 'needs_reschedule')
     group by 1
    having count(*) > 1
  ) x on x.psid = m.creditos[1]
 where m.n = 1 and not m.declarada_sin_paquete
   and coalesce(r.status, '') not in ('cancelled', 'canceled', 'needs_reschedule');

comment on view public.package_credit_backfill_report is
  'Revisión previa a la 019. Bloquean: viva_sin_clasificar, evidencia_contradictoria, resolucion_invalida, credito_con_varias_vivas. muerta_sin_clasificar no bloquea: la 019 la pone en cuarentena. El conjunto a revisar es estructural (entrenador con paquetes, creada entre su primer paquete y la 019), no depende de notes/email. Solo lectura. Migración 018.';

revoke all on public.package_credit_backfill_mapping from public, anon, authenticated;
revoke all on public.package_credit_backfill_report from public, anon, authenticated;

commit;
