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
| `deleteAvailabilitySlot` (`lib/services/availability.service.ts`) | borrado directo, sin consumidores (ni imports, ni barrels, ni otras ramas locales) | **eliminado** (revisión de Codex); `scripts/verify-slot-deletes.mjs` falla si reaparece un `.from('availability_slots')…delete(` fuera de `delete-windows.ts` |
| `scripts/verify-max-capacity-fix.mjs` | borra reservas y después ventanas | compatible con RESTRICT |

Ninguno necesitaba el CASCADE. Los dos borrados reales pasan por
`lib/availability/delete-windows.ts`: lote y, si la base lo rechaza por la
FK de reservations (23503 **de `reservations_availability_slot_id_fkey`**;
un 23503 de otra restricción se propaga como error), una a una; las ventanas que ganaron una reserva se conservan y
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

### Sincronización atómica de ventanas (migración 014, revisión de Codex)

Antes, `generateSlotsForTrainer` aplicaba su plan en cinco escrituras
sueltas (INSERT → DELETE → UPDATE fin → CLOSE → REOPEN). Un fallo a mitad
dejaba estados mixtos; el peor: ventanas nuevas creadas y las retiradas sin
borrar ni cerrar, es decir, **horas que el entrenador quitó, publicadas**.

Evaluado:

- *Reordenar* (cerrar/borrar primero, abrir al final) solo cambia hacia
  qué lado cae el fallo: un paso por lotes o una a una puede quedarse a
  medias, el UPDATE de fin puede ir en los dos sentidos, y el plan sale de
  una lectura que puede estar desfasada (una reserva pública entra entre la
  lectura y la escritura). No basta.
- *Atomicidad en PostgreSQL*: elegido. `migrations/014_apply_window_plan.sql`,
  `apply_window_plan(trainer, plan)`: el generador sigue calculando el plan
  en TypeScript y la función lo aplica en UNA transacción, con cerrojo por
  entrenador, `FOR UPDATE` de las ventanas afectadas y revalidación con las
  filas bloqueadas (borrar una que ya tiene reservas → se cierra; acortar
  dejando fuera una reserva viva → se cierra; insertar algo ya creado → se
  ignora; filas ajenas o manuales → error). Cualquier error, incluido un
  23503 de otra FK, deshace todo: lo publicado queda como estaba.
  Sin la 014 aplicada no hay camino alternativo: la sincronización falla y
  se dice (no se vuelve a las escrituras sueltas).

Queda un estado parcial que la función no puede cubrir: el cambio de
horario/excepción se guarda (otra escritura) y la sincronización falla. Las
7 rutas lo devuelven como `500 { code: 'sync_failed', saved }` con un
mensaje que dice que la disponibilidad publicada NO ha cambiado
(`lib/availability/sync-response.ts`), y la interfaz no lo presenta como
hecho: «Guardar cambios» del horario no muestra «Guardado» sino «Tu horario
se ha guardado, pero tu disponibilidad publicada NO se ha actualizado…»;
«Añadir excepción» avisa y no deja reenviarla; quitar una excepción recarga
la lista y avisa; «Sincronizar huecos» dice «No se ha sincronizado…» y no
enseña resumen (si solo falla la limpieza de huecos antiguos, lo dice
aparte).

Pruebas: `scripts/verify-window-plan-db.sh` (Postgres aislado, 47):
- fallos inyectados en cada fase (cerrar, borrar, fin, insertar, reabrir),
  un 23503 de otra FK y un fallo después de la función en la misma
  transacción: ventanas, reservas y lo publicado exactamente igual;
- plan completo con un plan viejo (ventana que ganó una reserva → cerrada)
  y un acortamiento imposible (→ cerrada); publicado solo lo que el patrón
  quiere; ninguna reserva perdida, historial incluido; aplicar el mismo
  plan otra vez no cambia nada;
- concurrencia: reserva pública en curso contra el borrado (la
  sincronización espera y cierra), sincronización primero (la reserva
  espera y la base la rechaza), cinco sincronizaciones a la vez;
- el plan que produce el `generate.ts` real (`scripts/lib/capture-window-plan.mjs`)
  aplicado por la función real;
- permisos y filas ajenas/manuales.
`scripts/verify-window-sync.mjs` (6, dobles): las 7 rutas con fallo →
`sync_failed` y `saved` correcto, sin detalles internos; mensaje de la 014
sin aplicar; el generador hace una sola llamada y ninguna escritura directa;
comprobaciones de la interfaz. Navegador (escrituras interceptadas, nada
llegó al servidor): «Sincronizar huecos», «Guardar cambios» y «Añadir
excepción» con la sincronización fallando.

Límites:

- **Hay que aplicar la 014 (después de la 013)** antes de desplegar este
  código: sin ella, cualquier cambio de horario se guarda pero no se
  sincroniza (y se avisa).
- ~~Una reserva validada con el rango viejo de una ventana podía entrar
  justo después de acortarla (C4).~~ **Resuelto por la migración 015**
  (`reservations_within_window`, ver la sección siguiente): cuando esté
  aplicada, la base rechaza esa reserva en los dos órdenes de concurrencia
  (probado en `scripts/verify-window-range-db.sh` y en el C4 de
  `scripts/verify-window-plan-db.sh`, que ahora espera el rechazo). **Hasta
  aplicar la 015 en Supabase, C4 sigue siendo posible en la base real.**
- La purga de huecos legacy sigue aparte (solo borra ventanas manuales
  vacías: si se queda a medias, se ofrece de menos, nunca de más).
- `refreshAllWindows` (available/full) después de sincronizar sigue siendo
  aparte; no reabre ventanas `blocked`.

### Revisión de Codex sobre 58fcaea (26/09/2026)

1. **Reserva fuera de su ventana (C4)** — `migrations/015_reservations_within_window.sql`.
   La base impide en los dos sentidos que una reserva viva quede fuera del
   rango vigente de su ventana: trigger en `reservations` (INSERT / UPDATE
   de ventana, horas o estado: bloquea la ventana `FOR SHARE` y comprueba el
   rango) y en `availability_slots` (UPDATE de inicio/fin: rechaza dejar
   fuera una reserva viva). Cubre web pública, manual, clase puntual,
   mover/proponer y paquetes. La app lo trata como «franja no disponible»
   (409, `isSlotConflictError`). La migración se niega si ya hay reservas
   vivas fuera de su ventana (consulta en su cabecera). Probado en los dos
   órdenes (reserva → acortamiento y acortamiento → reserva), con la
   sincronización y con un UPDATE directo: `scripts/verify-window-range-db.sh`.
2. **Plan desfasado** — `migrations/016_availability_revision.sql`.
   `trainers.availability_revision` sube con cada cambio de horario o
   excepción (triggers); el generador la lee antes que el horario y
   `apply_window_plan(trainer, plan, revision)` rechaza el plan
   (`window_plan_stale`) si cambió. Se borra la versión sin revisión.
   `syncWindows` recalcula hasta 3 veces. Probado con planes del
   `generate.ts` real (A calcula → B apaga el día y sincroniza → A
   rechazado; el día no se publica) y en los dos órdenes de concurrencia:
   `scripts/verify-schedule-revision-db.sh`.
3. **«Sincronizar huecos»** en serie: primero la sincronización; la
   limpieza de huecos antiguos solo si se confirmó. Cada una se informa por
   separado (`components/dashboard/availability/sync-report.ts`).
4. **Respuesta perdida / resultado no confirmado**: `sync_failed` lleva
   `outcome`. Tras mandar la escritura, `not_applied` SOLO con evidencia
   fiable: un error con el identificador que únicamente producen nuestras
   funciones o restricciones y su código (`window_plan_stale`,
   `window_plan_foreign_row`, `one_off_window_conflict`,
   `reservations_no_overlap`, `reservations_within_window`, «no existe
   apply_window_plan / create_one_off_reservation»;
   `lib/supabase/error-codes.ts`, `isConfirmedRejection`). Cualquier otro
   error — sin código, o con un código de formato válido que podría haber
   mandado un proxy — es `unknown` y el mensaje empieza por «Resultado no
   confirmado», nunca «no ha cambiado». (Revisión de Codex sobre 06406f1:
   antes bastaba con que el código tuviera 5 caracteres o empezara por
   PGRST.) Un fallo antes de mandar la escritura (lecturas previas) sigue
   siendo `not_applied`. En el navegador (`components/dashboard/availability/api.ts`
   y el diálogo de nueva reserva), red caída, respuesta ilegible o un JSON
   que no es nuestro `{ success: false, error }` = no confirmado: recargan
   y lo dicen; la clase puntual no deja reenviar. Pruebas:
   `scripts/verify-sync-outcome.mjs` y `scripts/verify-one-off.mjs`
   (incluye códigos de proxy `23503`, `23P01`, `PGRST301`, `57014`).

Límites:

- Hay que aplicar 011 → 020 en orden antes de desplegar este código (ver
  «Orden de aplicación en Supabase» más abajo).
- La 015 se para si la base real ya tiene reservas vivas fuera de su
  ventana; habrá que resolverlas a mano antes (no se toca ningún dato).
- `FOR SHARE` en cada reserva viva que se crea o mueve: una reserva espera
  mientras se sincroniza o se acorta su ventana (milisegundos en la
  práctica; las pruebas lo alargan con `pg_sleep`).
- La revisión sube con cualquier escritura del horario, aunque no cambie
  nada que afecte a las ventanas: puede provocar un recálculo de más.
- «No aplicado» solo se afirma con el identificador de nuestra función o
  restricción. Un proxy que copiara también ese identificador exacto no se
  distinguiría (no es un caso realista). A cambio, algunos rechazos reales
  sin identificador propio (p. ej. un `statement_timeout`) se muestran
  como «no confirmado» aunque la transacción se deshiciera.
- La reserva manual y la web pública no se han tocado en este aspecto
  (siguen diciendo «no se pudo…» ante un error que no reconocen).

## Numeración de migraciones (resuelta al integrar pagos-paquetes)

`emdash/pagos-paquetes-t3o2n` (88595bd, con sus commits anteriores dd0e739 y
44888db) se integró en esta rama el 26/09/2026. Sus migraciones pasan a
números posteriores y únicos, conservando su orden:

| Antes (pagos) | Ahora | Qué es |
|---|---|---|
| `011_package_session_atomic_schedule` | `017_package_session_atomic_schedule` | agendar/desagendar una sesión de paquete en una transacción (R1) |
| `012a_package_credit_preparation` | `018_package_credit_preparation` | preparación: tabla de decisiones, corte y vistas de revisión |
| — | *(paso manual)* | decisiones sobre datos: resolver `package_credit_backfill_report` |
| `012b_package_credit_single_live` | `019_package_credit_single_live` | fase final con **escritores detenidos** (R2) |

Orden final completo: `001 … 010` → `011_schema_compat` →
`012_one_off_reservation` → `013_reservations_slot_fk_restrict` →
`014_apply_window_plan` → `015_reservations_within_window` →
`016_availability_revision` → `017_package_session_atomic_schedule` →
`018_package_credit_preparation` → *(decisiones)* →
`019_package_credit_single_live` (detener escritores, aplicar, desplegar,
reabrir; ver `docs/DATABASE.md`). Las de pagos solo requieren
004/006/007/008/010, así que van al final sin depender de las nuestras.

Renumerado a la vez: cabeceras, mensajes de error (`'017 requiere la 006'`,
`'019 requiere la 017/018'`…) y comentarios de las tres migraciones; los
mensajes y comentarios de `lib/packages/schedule.ts`,
`lib/reservations/proposal.ts`, `edit.ts`, `slots.ts` y
`lib/packages/queries.ts`; la sección de paquetes de `docs/DATABASE.md`; y los
scripts `verify-package-*`.

Interacción comprobada (`scripts/verify-integration-chain-db.sh`, cadena
001 → 019 desde vacío): las funciones de pagos ya bloquean la ventana
`FOR SHARE` y comprueban el rango (`out_of_window`), igual que el trigger de
la 015, que queda como red (un insert a mano fuera → 23514). Agendar o
proponer frente a una sincronización que acorta (014/016) esperan en los dos
órdenes y no dejan nada a medias (crédito libre u original pendiente). Al
revivir una reserva de paquete salta antes la guardia de pagos
(`reservations_package_no_revive`) que la de la 015 (orden alfabético de
triggers). El plan de sincronización cierra, no borra, una ventana con
reservas de paquete. `package_credit_integrity_check` queda sin filas que
bloqueen. En la app, el 23514 de la 015 dentro de `schedule_package_session`
y `propose_reschedule` se traduce a 409 (`isSlotConflictError`), junto a los
409 propios de pagos (crédito ocupado, revivir, cuarentena).

## Orden de aplicación en Supabase (corrección del 27/09/2026)

**Estricto por número, sin saltos: la 018 nunca antes de 011–017.** En la
revisión previa al despliegue se propuso aplicar la 018 antes de la ventana y
después 011 → 017 → 019: eso dejaba la 018 por delante de sus requisitos y
fuera del orden probado (todas las pruebas aplican las migraciones por
número), y contradice el procedimiento de la 019 («017 y 018 aplicadas»). Lo
correcto es:

1. **Fase previa (con la app en marcha, opcional):** 011 → 012 → 013 → 014 →
   015 → 016 → 017 → 018, en ese orden. Ninguna exige detener escritores. Con
   el código antiguo desplegado, algunos errores pasan a fallar cerrados: el
   generador antiguo no podrá borrar ventanas con reservas (013) ni acortar
   una ventana dejando fuera una reserva viva (015). Responden con error, no
   pierden datos. Si eso no es aceptable, todo este paso va dentro de la
   ventana (paso 3).
2. **Decisiones sobre datos** (solo con la 018 ya aplicada):
   `select problema, count(*) from public.package_credit_backfill_report group by 1;`
   y resolver cada fila bloqueante en `package_credit_resolutions` (ver la
   cabecera de la 018). Con la app en marcha pueden aparecer reservas nuevas
   como `viva_sin_clasificar`.
3. **Ventana de mantenimiento:** detener escritores → (si no se hizo el paso
   1: 011 → 018 y el paso 2) → repasar el informe de la 018 y decidir lo
   nuevo → **019** → `notify pgrst, 'reload schema';` → **020** (o antes: es
   independiente) → desplegar el código → reabrir escritores.
4. **Comprobar:** `select * from public.package_credit_integrity_check where bloquea;`
   (vacío) y el informe de la 018 (solo `muerta_sin_clasificar`).
5. **Administradores:** alta en `public.admins` (SQL en la cabecera de la 020)
   y Redirect URL `<origen>/admin/auth/callback` en Supabase Auth.

Las consultas previas de solo lectura para medir cada paso están en la
revisión del 26/09 y en las cabeceras de 011, 015 y 018.

## Administración (`/admin`, `/api/admin`) — 27/09/2026

Bloqueante 3 de `docs/ANTES_DE_PUBLICAR.md`. Todo lo administrativo que existe:
las páginas `/admin` (nueva, lleva al panel) y `/admin/dashboard`, y la ruta
`POST /api/admin/setup-mauri`. El login de `/admin` era un formulario que no
autenticaba y enseñaba credenciales de demo.

- **Sesión:** la de toda la app (Supabase Auth; `getUser()` en el servidor).
  `/admin/login` usa el mismo acceso por enlace mágico o Google, con su
  propio callback (`/admin/auth/callback`, que solo vuelve a `/admin/*`) y
  cierre de sesión. `proxy.ts` lleva a `/admin/login` a quien no tiene sesión.
- **Permiso:** una fila en `public.admins` (migración 020), el mismo patrón
  que `trainers.auth_user_id` y `players.auth_user_id`. Se concede a mano en
  el SQL Editor; ninguna ruta escribe en esa tabla. RLS sin políticas y sin
  GRANT para anon/authenticated.
- **Servidor, fallando cerrado** (`lib/auth/current-admin.ts`): cada página
  llama a `requireAdminPage()` (sin sesión → login; jugador o entrenador sin
  permiso → 404) y cada ruta de `/api/admin` a `requireAdmin()` (401/403)
  antes de tocar la base. Si la tabla no existe o falla la lectura, nadie es
  administrador. `setup-mauri` sigue además cerrada en producción (404).
- **Pruebas:** `scripts/verify-admin-access.mjs` (código real con dobles:
  sin sesión, jugador, entrenador, admin y tabla sin crear; llamadas directas
  a la API; páginas; callback y `next`; proxy; inventario que falla si una
  página o ruta nueva no comprueba el permiso). La 020 se aplica en
  `scripts/verify-integration-chain-db.sh` (cadena 001 → 020: RLS, anon y
  authenticated sin acceso, service_role sí, SQL de alta idempotente).

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
