# Estado de integración — A1/A2 + A3.1 + UI

Última actualización: 26/09/2026. Worktree: `integracion-programa`.

## HECHO

- A1 (cuenta de jugador), A2 (checkout, identidad, precios por entrenador,
  jugadores, mensajes, WhatsApp y metadatos de reprogramación) sigue integrado.
- A3.1 se incorporó desde `6c82840`: Perfil público del entrenador, Public
  pricing dentro de Perfil y Disponibilidad centrada en horarios y duraciones.
- Se conserva la UI reciente del calendario y el prototipo `/programa` sigue
  aislado con datos de ejemplo y bloqueado salvo `PROGRAMA_DEMO=1`.
- El Player Development Plan queda definido como un pack de 10 sesiones, con
  créditos que se consumen al agendar y caducidad/reglas del catálogo. No es una
  suscripción recurrente y no se ha implementado.
- Los descuentos A2 de 5+ y 10+ sesiones siguen siendo reglas existentes; no se
  ha creado un editor de descuentos por paquetes. La futura propuesta de UI es
  `Profile → Packages`.

## VERIFICADO

- Checkpoint local previo a esta ronda: `21194ee`.
- Integración A3.1: commit local `f5910ae`, sin conflictos pendientes.
- Los precios editados en Perfil utilizan `PUT /api/dashboard/pricing` y el
  entrenador se deriva de la sesión. Las reservas guardan su snapshot histórico.
- El mini calendario conserva foco, Escape, navegación de teclado, fechas en
  zona Asia/Kuala_Lumpur y al elegir un día disponible cambia a vista Día.
- La disponibilidad pública y el POST de reservas rechazan fechas/horas pasadas;
  el flujo manual del dashboard también las rechaza en servidor.
- La web pública expone `Log in`/`Sign up` o `My account` según la sesión y
  reutiliza el login A1.
- `/cuenta` muestra próximas reservas, estado, entrenador, fecha, hora y duración
  filtradas por el `player_id` de la sesión; el historial se separa si existe.
- Tests estáticos A1/A2/UI y type-check deben ejecutarse antes de cada entrega;
  el baseline conocido de TypeScript es de 12 errores en archivos antiguos.

## PENDIENTE

- Prueba manual en navegador desktop y 375 px de `/mauri`, `/daniel-ruiz`, login,
  cuenta, dashboard, reservas, disponibilidad, Perfil y reserva manual.
- Verificar con navegador el mini calendario → Día, Enter/Tab/Escape, ausencia de
  recortes o scroll horizontal, fechas pasadas y estados de carga.
- Verificar migration 010 y el flujo completo en un entorno de prueba sin crear
  reservas en la base real.
- Confirmar visualmente la tabla responsive y el menú/panel de acciones del
  dashboard; no añadir acciones de pago o cancelación sin lógica existente.
- Migrar gradualmente textos españoles restantes del dashboard/calendario al
  inglés. El checkout público ya está en inglés; algunos flujos históricos del
  dashboard siguen en español.
- Integrar un proveedor real de email antes de prometer confirmaciones por email;
  `lib/notifications/notify.ts` sigue siendo un stub.

## Clase puntual desde el calendario (26/09/2026)

Decisiones:

- **Selección de tramo** en el calendario del Resumen: arrastrar con el ratón
  (solo `pointerType === 'mouse'`, a partir de 6 px; un clic quieto sigue
  siendo el clic de siempre) o, en táctil, «Elegir tramo» + dos toques
  (inicio y fin). Nunca empieza sobre una reserva (`data-reservation`). No se
  toca `touch-action`: el dedo sigue desplazando la rejilla. Celdas de 30 min.
  Al soltar, `RangeSelectionDialog` enseña fecha, inicio y fin **sin guardar**.
- **«Crear clase puntual»** (acción principal): reserva ese tramo para un
  cliente una sola vez, aunque esté fuera de la disponibilidad. Sigue en
  «Nueva reserva» (datos del cliente, confirmada/pendiente, precio de 1
  jugador) y guarda con `POST /api/dashboard/reservations/one-off`.
  Si el tramo no mide una duración ofrecida, se elige una empezando a la
  misma hora.
- **Sin columnas ni tablas nuevas.** `reservations.availability_slot_id` es
  NOT NULL y `reservations.session_date` (la de `reservations_no_overlap`,
  008) la pone un trigger desde la ventana. Por eso:
  - tramo dentro de una ventana abierta → reserva manual normal en ella;
  - si no → ventana propia del tamaño **exacto** de la clase con
    `status = 'blocked'` y `generated_by_pattern = false`, y la reserva
    dentro. `blocked` es cerrada para `isSlotOpen` (la web no la ofrece ni la
    acepta), `refreshWindowStatus` no la reabre al cancelar y el generador
    semanal no toca filas manuales.
- **Atómica en PostgreSQL (revisión de Codex, 26/09/2026).** La primera
  versión (1b115e9) creaba la ventana, insertaba la reserva y, si fallaba,
  borraba la ventana desde la app: otra petición podía reutilizar esa ventana
  a medias y la limpieza podía fallar y dejarla huérfana. Ahora lo hace la
  función `create_one_off_reservation` (`migrations/012`) en una sola
  transacción, con `pg_advisory_xact_lock` por entrenador y día: cualquier
  fallo deshace ventana y reserva juntas y no hay limpieza. Las reservas que
  no pasan por la función (web, manual) las frena `reservations_no_overlap`.
  Solo la ejecuta `service_role`. Sin la 012 aplicada la ruta responde 503;
  no hay camino alternativo no atómico.
- **Base creada desde cero (revisión de Codex, 2.ª ronda).** Con 001 → 010
  una base nueva no aceptaba lo que escribe el flujo: CHECK de `class_type`
  sin `'private'`, unique con `class_type` en vez de `end_time`, sin
  `client_name`/`client_email`/`client_phone`/`price` en `reservations`, y
  `client_id`/`session_time`/`class_type` NOT NULL. `migrations/011_schema_compat.sql`
  la lleva a la forma desplegada, paso a paso y solo si encuentra la de la
  001 (sobre lo desplegado no cambia nada: probado comparando restricciones,
  índices y columnas): tabla `class_types` + FK en lugar del CHECK, unique
  por rango, columnas del cliente, columnas de la 001 sin NOT NULL y
  `availability_slot_id` NOT NULL (una reserva sin ventana no tiene fecha y
  escaparía de la 008; si hay datos así, se para sin borrar nada). No toca
  `reservations_no_overlap` ni su trigger. La función pasa a
  `migrations/012_one_off_reservation.sql` (renumerada; nunca se aplicó) y
  exige la 011.
- **Comprobaciones de la 012 al aplicarse:** la 008 (restricción y
  trigger), las columnas de la 005/007/010/011, `availability_slot_id` NOT
  NULL, que `'private'` exista donde apunte la FK de `class_type`, y —con
  una fila de prueba que siempre se deshace— que los CHECK admitan una
  ventana `private`/`blocked`. Si el rol no puede usar
  `session_replication_role`, avisa y sigue sin esa prueba. Una violación de
  unicidad sale como `one_off_window_conflict` (409).
- **Modo de dos toques:** tocar una reserva mientras se elige un tramo no
  hace nada (ni resumen ni detalle, ni cuenta como inicio o fin); se avisa
  en el texto de ayuda. Al activar el modo se cierra un resumen fijado. Con
  teclado y fuera del modo, las reservas se abren como siempre.
- **Validación en servidor** (`lib/reservations/one-off.ts`, reglas en
  `one-off-rules.ts`): entrenador de la sesión (nunca `trainer_id` del
  navegador), duración ofrecida, rejilla de 30 min, mismo día, no pasado (KL),
  a un año vista como mucho, sin pisar reservas vivas de ninguna ventana del
  día (falla cerrado si no puede leerlas), y la base como red final (23P01 y
  conflicto de ventana → 409; función sin aplicar → 503).
- **«Abrir disponibilidad»** (secundaria): enlace a `/dashboard/disponibilidad`
  con el aviso de que ahí se cambia el horario que se repite cada semana y
  que lo abierto se puede reservar en la web. No abre nada por sí solo ni
  implementa disponibilidad pública excepcional de un día.
- En el calendario, una ventana `blocked`/`cancelled` ya no se pinta con el
  fondo blanco de «abierto» (solo se ven sus reservas).

Pruebas: `scripts/verify-one-off.mjs` (código real con dobles de Supabase:
reglas, servidor, ruta, no publicación, generador) y
`scripts/verify-one-off-db.sh` (Postgres aislado en Docker, 68 casos): la
cadena entera 001 → 012 en una base vacía (con `scripts/db/supabase-stubs.sql`:
roles, `auth`, `extensions`), idempotencia, la 011 sin cambios sobre
`scripts/db/deployed-schema.sql`, la 012 rechazada sin la 011, la 008
intacta; fallo de la reserva después de crear o reutilizar la ventana; y
concurrencia determinista (la primera transacción abierta con `pg_sleep`):
misma franja con commit y con rollback, 10 reutilizaciones simultáneas de
una ventana cancelada, reutilización contra una cancelación sin confirmar,
reutilización contra un DELETE concurrente de la ventana (commit y
rollback), DELETE contra una reutilización en curso, franjas solapadas,
reserva de la web sin cerrojo y ráfagas de 10.
Navegador (desktop y iframe de 375 px, con los POST interceptados en la
página: no se guardó ninguna reserva): arrastre, clic normal, arrastre desde
reserva, solape, duración no ofrecida, dos toques, envío de la puntual.

Límites conocidos:

- **La 011 y la 012 hay que aplicarlas en Supabase**, en ese orden (SQL
  Editor, como postgres, y `notify pgrst, 'reload schema';`). Hasta entonces
  «Crear clase puntual» fuera del horario responde 503; dentro de una
  ventana abierta funciona. No se han probado contra la Supabase real: la
  forma desplegada se ha reproducido en `scripts/db/deployed-schema.sql` a
  partir de la inspección del 26/09 (sin saber, por ejemplo, la acción ON
  DELETE real de la FK de `availability_slot_id`).
- La 011 cambia el comentario de la tabla `class_types` también en la base
  desplegada (lo demás es no-op).
- No se sabe si el rol `postgres` de Supabase puede usar
  `session_replication_role`; si no, la 012 lo avisa y se aplica sin la
  prueba de CHECK (el resto de comprobaciones sí se hacen). Si luego un CHECK
  rechazara la ventana, cada clase puntual daría 500 y no quedaría nada
  escrito.
- Si la respuesta se pierde después del commit (red), el entrenador ve un
  error pero la clase está creada; al reintentar le sale «franja ocupada» y
  la ve en el calendario al recargar.
- (Resuelto en la 013, ver abajo.) La purga de huecos legacy y el
  generador podían llevarse reservas por el ON DELETE CASCADE de la base
  real.

- El arrastre no desplaza la rejilla sola al llegar al borde; un tramo largo
  que no se ve entero se elige con «Elegir tramo» (dos toques, con scroll en
  medio).
- Sin alternativa de teclado para un tramo fuera del horario: con teclado
  sigue la rejilla de horas de los tramos libres.
- Si más adelante el horario semanal pide exactamente el mismo rango que una
  ventana puntual, la restricción única hace que el generador no cree la
  suya ese día: ese rango se queda cerrado (lo ocupa la clase puntual). Si se
  cancela esa clase, ese día no se reabre solo.
- Una ventana puntual vacía (reserva cancelada o movida) se queda en la base
  como `blocked`; no se ofrece a nadie y se reutiliza si se vuelve a crear la
  misma clase.
- La reserva puntual se crea sin `player_id` (igual que la manual); la
  vinculación con cuentas de jugador sigue en FUTURO.

## Borrar ventanas sin llevarse reservas (26/09/2026)

Una consulta de solo lectura a la base real confirmó
`reservations_availability_slot_id_fkey → ON DELETE CASCADE`: borrar una
fila de `availability_slots` borraba en silencio todas sus reservas.

Caminos que borran ventanas (revisados todos):

| Camino | Antes | Ahora |
|---|---|---|
| Generador semanal (`lib/availability/generate.ts`; lo llaman las rutas de horario, excepciones y «Sincronizar huecos») | borraba ventanas sin reserva **viva**: se llevaba las canceladas (historial) y, en carrera, una reserva nueva | solo pide borrar ventanas **sin ninguna** reserva; si el patrón ya no quiere una con historial, la cierra (`blocked`, «retirada») y la reabre/reutiliza si la vuelve a querer |
| Purga legacy (`lib/availability/cleanup.ts`, botón «Sincronizar huecos») | igual que el generador | no propone ventanas con historial (`skippedWithHistory`) |
| `deleteAvailabilitySlot` (`lib/services/availability.service.ts`) | nadie lo importa | sin cambios (código muerto) |
| `scripts/verify-max-capacity-fix.mjs` | borra reservas y después ventanas | compatible con RESTRICT |

Ninguno necesitaba el CASCADE. Los dos borrados reales pasan por
`lib/availability/delete-windows.ts`: lote y, si la base lo rechaza por la
FK (23503), una a una; las ventanas que ganaron una reserva se conservan y
se cuentan (`keptReferenced` / `skippedReferenced`, visible en el resumen de
«Sincronizar huecos»). Cualquier otro error sigue abortando.

`migrations/013_reservations_slot_fk_restrict.sql` cambia la FK a ON DELETE
RESTRICT: mismo nombre, columnas y ON UPDATE; NOT VALID + VALIDATE en la
misma transacción; no toca filas; idempotente; también convierte el SET
NULL de una base creada desde la 001. Con RESTRICT la base rechaza borrar
una ventana con cualquier reserva, también una recién confirmada por otra
transacción.

Pruebas: `scripts/verify-slot-fk-db.sh` (Postgres aislado, 30 casos):
antes de la 013 con CASCADE se pierde el historial y una reserva viva que
entra durante el borrado; la 013 no cambia la huella de ninguna fila, es
idempotente, conserva ON UPDATE y funciona desde la 001; después, borrados
con reserva viva/cancelada → 23503 y sin reservas → se borra; lote que falla
entero y una a una; purga contra clase puntual que reutiliza la ventana en
los dos órdenes (commit y rollback); reserva de la web durante el borrado;
cancelación. `scripts/verify-slot-deletes.mjs` (11, dobles): generador,
purga y helper, con prueba de mutación (volver a borrar ventanas con
historial hace fallar 2 casos).

Límites:

- **Hasta aplicar la 013 en Supabase el CASCADE sigue activo.** El código
  nuevo ya no pide borrar ventanas con reservas, pero una reserva que entre
  entre la lectura y el borrado se la seguiría llevando.
- La 013 bloquea `reservations` un momento (DROP/ADD CONSTRAINT y
  validación): aplicarla en un momento tranquilo.
- Borrar un entrenador (`availability_slots.trainer_id` ON DELETE CASCADE
  en la 001) ya no puede arrastrar reservas a través de sus ventanas: si
  tiene reservas, fallará. Ninguna ruta borra entrenadores.
- Las ventanas «retiradas» (cerradas con historial) se quedan en la base.

## Numeración de migraciones (pendiente al unir ramas)

Esta rama: `011_schema_compat`, `012_one_off_reservation` (requiere 011) y
`013_reservations_slot_fk_restrict`. La rama `emdash/pagos-paquetes-t3o2n`
tiene `011_package_session_atomic_schedule.sql` (commit 44888db) y, sin
commitear en su worktree, `012a_package_credit_preparation.sql` y
`012b_package_credit_single_live.sql`. Ninguna de las tres toca
`reservations.availability_slot_id` ni lo que cambian las nuestras (sus
funciones insertan reservas con `availability_slot_id` y dependen de la
008/010; con la 013 una ventana con reservas de paquete tampoco se puede
borrar, que es lo deseado).

No se ha aplicado ni integrado ninguna. Al unir, hay que darles números
únicos y un orden: las de pagos-paquetes solo requieren 004/006/007/008/010,
así que pueden ir antes o después de las nuestras; nuestra 012 requiere
nuestra 011, y la 013 es independiente. Los mensajes de error de cada
migración (`'011 requiere…'`, `'012 requiere…'`) y las referencias en
`lib/reservations/one-off.ts`, `docs/` y los `scripts/verify-*` llevan el
número y habrá que renumerarlos a la vez.

## FUTURO (no implementado)

- **Disponibilidad pública excepcional de un día desde el calendario** (abrir
  a la web solo el tramo elegido, esa fecha). Hoy «Abrir disponibilidad» solo
  lleva al editor, sin rellenar nada; allí las excepciones por fecha que ya
  existían sustituyen el horario de TODO ese día, no añaden un tramo.

- **«Nueva reserva» vinculada a una cuenta existente.** El entrenador podrá
  buscar por nombre o email y **seleccionar explícitamente** una cuenta de
  jugador; la reserva guardará el `player_id` de esa selección (el ID elegido,
  no un texto) para que la clase aparezca en `/cuenta` de ese jugador.
  - Nunca vincular por coincidencia de nombre (ni de email escrito a mano): solo
    con la cuenta que el entrenador elige en la lista.
  - El servidor debe comprobar que ese `player_id` existe y que el entrenador
    puede verlo (relación en `player_trainers`), y no aceptarlo de ningún otro
    sitio. Hoy la reserva manual crea `player_id` NULL
    (`lib/reservations/manual.ts`).
  - La búsqueda no debe exponer más datos de los necesarios para distinguir
    cuentas (nombre y email parcial, por ejemplo).
  - Registrado el 25/09/2026; sin fecha de implementación.
