# Paso a producción: migraciones 011 → 021

Este procedimiento es para la base real de Supabase. No usa `.env.local`, no
conecta desde estos archivos y no sustituye las comprobaciones del SQL Editor.
Los scripts `ops/produccion-021/01_consultas_previas.sql` y
`ops/produccion-021/03_verificacion.sql` son de solo lectura. La limpieza es un
procedimiento operativo, no una migración.

## 0. Preparación y criterios de parada

1. Abrir una ventana de mantenimiento y anunciar que no se podrán crear,
   editar, proponer, aceptar, cancelar ni agendar reservas durante la limpieza
   y la aplicación de la 019. Preparar rollback operativo y conservar una copia
   de los resultados de las consultas.
2. Ejecutar `01_consultas_previas.sql` en el SQL Editor, una consulta cada vez.
   Revisar manualmente todas las FKs, triggers, reglas, vistas, escritores,
   recuentos, extensiones y la copia `reservations_backup_008`.
3. Detener todos los escritores antes de C5 y repetir C5 con ellos detenidos.
   Si aparece un escritor desconocido, una FK o trigger desconocido, una
   diferencia de recuentos, reservas vivas fuera de ventana o cualquier dato
   que no se pueda clasificar con evidencia, parar y resolverlo antes de seguir.
4. No ejecutar la limpieza sin rellenar exactamente los cinco valores del paso
   0 con C5. El modo inicial debe ser `ensayo`.

## 1. Limpieza de datos de prueba

Editar solo la copia de trabajo de
`ops/produccion-021/02_limpieza_datos_prueba.sql`:

- sustituir `RESERVAS_TOTAL`, `ULTIMA_RESERVA`, `PAQUETES_TOTAL`,
  `SESIONES_TOTAL` y `ULTIMO_PAQUETE` por los valores de C5;
- dejar `MODO` como `'ensayo'`.

Ejecutar el archivo completo en una sola transacción como `postgres`. Debe
terminar con `ENSAYO OK`; ese resultado se produce mediante rollback y no deja
cambios. Si falla, no continuar ni cambiar a `borrar`: conservar el error y
revisar la causa.

El procedimiento bloquea las tablas afectadas con `lock_timeout`, comprueba que
no haya escritores, FKs, triggers ni reglas desconocidos, fotografía los
objetos y comprueba los recuentos antes de borrar. Si algo cambia durante el
paso, toda la transacción se deshace.

Después del ensayo, volver a ejecutar C5 y confirmar que sigue igual. Solo
entonces cambiar `MODO` a `'borrar'` y ejecutar otra vez, siempre con los
escritores detenidos. Guardar la tabla final de recuentos. Se borran reservas,
paquetes, sesiones y sus dependientes explícitos; se conservan cuentas, players,
relaciones, entrenadores, precios, horarios, excepciones, ventanas y
`reservations_backup_008`.

Las ventanas no se borran. Para las ventanas afectadas se pone
`current_bookings = 0` y únicamente `status = 'full'` pasa a `'available'`.
Estados `blocked`, `manual` y cualquier otro estado distinto de `full` no se
reabren ni se modifican por esa regla.

## 2. Aplicación ordenada

Aplicar los archivos en orden estricto, sin saltos:

```text
011_schema_compat
012_one_off_reservation
013_reservations_slot_fk_restrict
014_apply_window_plan
015_reservations_within_window
016_availability_revision
017_package_session_atomic_schedule
018_package_credit_preparation
```

Tras la 018, consultar:

```sql
select problema, count(*)
from public.package_credit_backfill_report
group by problema;
```

Resolver cada fila bloqueante con evidencia en `package_credit_resolutions`.
No aplicar la 019 mientras queden `viva_sin_clasificar`,
`evidencia_contradictoria`, `resolucion_invalida` o
`credito_con_varias_vivas`.

Con los escritores aún detenidos, revisar de nuevo el informe y aplicar:

```text
019_package_credit_single_live
020_admins
021_booking_idempotency_rate_limit
```

La 019 es el punto que exige obligatoriamente escritores detenidos. La 020 y
021 pueden ser independientes de la limpieza, pero deben quedar aplicadas y
recargado PostgREST antes de desplegar el código que las necesita:

```sql
notify pgrst, 'reload schema';
```

## 3. Comprobación antes de reabrir

Ejecutar `ops/produccion-021/03_verificacion.sql`. Debe cumplirse:

- V1: todas las migraciones, triggers, funciones, FK, índice y revisión están
  presentes;
- V2: no hay filas bloqueantes ni reservas vivas fuera de ventana; el informe
  solo puede contener `muerta_sin_clasificar` si existe ese caso documentado;
- V3: `anon` y `authenticated` no tienen acceso a admins, créditos,
  `booking_requests`, contadores ni funciones de escritura;
- V4: los recuentos de configuración conservada coinciden con la tabla final
  de la limpieza.

Dar de alta los administradores mediante el SQL documentado en la cabecera de
`migrations/020_admins.sql` y configurar en Supabase Auth las Redirect URLs:

```text
<origen>/admin/auth/callback
```

Desplegar el código compatible con 019–021. Comprobar una reserva de prueba,
una repetición con la misma `Idempotency-Key`, un rechazo por solape y el acceso
administrativo. Solo después reabrir los escritores.

## 4. Si algo falla

No reintentar a ciegas. Ante un error de bloqueo, datos, dependencia,
`statement_timeout` o resultado desconocido, mantener la ventana de
mantenimiento, conservar el mensaje y comprobar el estado en solo lectura.
Las migraciones están en transacciones; no declarar éxito ni rollback sin
evidencia del SQL Editor. La 019 no debe aplicarse de nuevo sin revisar el
informe de la 018 y el estado de los escritores.
