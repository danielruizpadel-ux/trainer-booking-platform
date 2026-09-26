-- 013 — Borrar una ventana no puede borrar sus reservas (ON DELETE RESTRICT)
--
-- Numeración: ver docs/estado-integracion.md («Numeración de migraciones»):
-- la rama de pagos-paquetes también usa 011/012; al unir las ramas hay que
-- darles números únicos. Esta no depende de las de esa rama.
--
-- La consulta de solo lectura a la base real (26/09/2026) confirmó:
--   reservations_availability_slot_id_fkey → ON DELETE CASCADE
-- Es decir, borrar una fila de availability_slots borraba en silencio todas
-- sus reservas: las canceladas (historial) y también una viva que entrase
-- entre que la app lee la ventana y la borra. Los que borran ventanas son el
-- generador semanal (lib/availability/generate.ts) y la purga de huecos
-- legacy (lib/availability/cleanup.ts); ninguno necesita el CASCADE (solo
-- piden borrar ventanas sin reservas) y los dos manejan ya el rechazo
-- (lib/availability/delete-windows.ts: la ventana se conserva).
--
-- Aquí se cambia la acción a ON DELETE RESTRICT: la base rechaza (23503)
-- borrar una ventana que tenga cualquier reserva, de cualquier estado. Con
-- RESTRICT la comprobación es inmediata, también contra una reserva que otra
-- transacción acaba de confirmar.
--
--   * No borra ni modifica filas: solo cambia la restricción. Se conservan
--     su nombre, las columnas y la acción ON UPDATE que tuviera.
--   * Se añade NOT VALID y se valida después, en la misma transacción: todas
--     las filas actuales ya cumplen la FK (la tenían), así que no puede
--     fallar por datos; si fallara, la transacción deja la FK como estaba.
--   * Idempotente: si ya es RESTRICT, no hace nada.
--   * Base creada desde migrations/001 (ON DELETE SET NULL): también pasa a
--     RESTRICT.
--
-- Bloqueo: DROP/ADD CONSTRAINT toman un lock exclusivo breve sobre
-- reservations (y SHARE ROW EXCLUSIVE sobre availability_slots) mientras se
-- valida. Aplicar en un momento tranquilo.
--
-- Aplicar en Supabase → SQL Editor → Run (como postgres). En una transacción.

begin;

do $$
declare
  fk record;
  n integer;
  on_update text;
begin
  select count(*) into n
    from pg_constraint c
   where c.conrelid = 'public.reservations'::regclass
     and c.confrelid = 'public.availability_slots'::regclass
     and c.contype = 'f';
  if n = 0 then
    raise exception '013: no hay ninguna FK de reservations a availability_slots';
  end if;
  if n > 1 then
    raise exception '013: hay % FKs de reservations a availability_slots; revísalas a mano', n;
  end if;

  select c.conname, c.confdeltype, c.confupdtype, c.condeferrable, c.condeferred,
         (select array_agg(a.attname::text order by k.ord)
            from unnest(c.conkey) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as cols,
         (select array_agg(a.attname::text order by k.ord)
            from unnest(c.confkey) with ordinality as k(attnum, ord)
            join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum) as refcols
    into fk
    from pg_constraint c
   where c.conrelid = 'public.reservations'::regclass
     and c.confrelid = 'public.availability_slots'::regclass
     and c.contype = 'f';

  if fk.cols <> array['availability_slot_id'] or fk.refcols <> array['id'] then
    raise exception '013: la FK % no es availability_slot_id → id (%/%); revísala a mano', fk.conname, fk.cols, fk.refcols;
  end if;

  if fk.confdeltype = 'r' then
    raise notice '013: % ya es ON DELETE RESTRICT; nada que hacer', fk.conname;
    return;
  end if;

  on_update := case fk.confupdtype
    when 'a' then 'no action' when 'r' then 'restrict' when 'c' then 'cascade'
    when 'n' then 'set null' when 'd' then 'set default' end;

  raise notice '013: % pasa de ON DELETE % a RESTRICT (ON UPDATE %)', fk.conname,
    case fk.confdeltype when 'a' then 'NO ACTION' when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end,
    upper(on_update);

  execute format('alter table public.reservations drop constraint %I', fk.conname);
  execute format(
    'alter table public.reservations add constraint %I foreign key (availability_slot_id) '
    || 'references public.availability_slots (id) on update %s on delete restrict%s not valid',
    fk.conname, on_update,
    case when fk.condeferrable then ' deferrable' || case when fk.condeferred then ' initially deferred' else '' end else '' end
  );
  execute format('alter table public.reservations validate constraint %I', fk.conname);
end $$;

comment on column public.reservations.availability_slot_id is
  'Ventana (availability_slots.id) de la reserva. FK ON DELETE RESTRICT (migración 013): no se puede borrar una ventana que tenga reservas de ningún estado.';

commit;
