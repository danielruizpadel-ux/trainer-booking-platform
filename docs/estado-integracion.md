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
  función `create_one_off_reservation` (`migrations/011`) en una sola
  transacción, con `pg_advisory_xact_lock` por entrenador y día: cualquier
  fallo deshace ventana y reserva juntas y no hay limpieza. Las reservas que
  no pasan por la función (web, manual) las frena `reservations_no_overlap`.
  Solo la ejecuta `service_role`. Sin la 011 aplicada la ruta responde 503;
  no hay camino alternativo no atómico.
- **Compatibilidad del esquema (revisión de Codex).** `migrations/001` no es
  lo desplegado (CHECK de `class_type` y `status`, unique con `class_type`).
  La 011 comprueba al aplicarse, contra el esquema real: la 008 (restricción
  y trigger), las columnas de la 005/007/010, que `'private'` exista donde
  apunte la FK de `class_type`, y —con una fila de prueba que siempre se
  deshace— que los CHECK admitan una ventana `private`/`blocked`. Si no,
  se para con un mensaje claro. Si el rol no puede usar
  `session_replication_role`, avisa y sigue sin la prueba de CHECK. La
  función no depende de la forma del unique: una violación de unicidad sale
  como `one_off_window_conflict` (409). Referencia del esquema desplegado
  para pruebas: `scripts/db/deployed-schema.sql`.
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
`scripts/verify-one-off-db.sh` (Postgres aislado en Docker:
`scripts/db/deployed-schema.sql` + la 008 y la 011 tal cual; 50 casos:
función, atomicidad con fallo después de crear la ventana, permisos, carreras
deterministas —transacción abierta con `pg_sleep` mientras llega la
segunda: misma franja con commit y con rollback, reutilización con rollback,
franjas solapadas, reserva de la web sin cerrojo—, ráfagas de 10 en
paralelo, y variantes de esquema incompatibles o con el unique de la 001).
Navegador (desktop y iframe de 375 px, con los POST interceptados en la
página: no se guardó ninguna reserva): arrastre, clic normal, arrastre desde
reserva, solape, duración no ofrecida, dos toques, envío de la puntual.

Límites conocidos:

- **La 011 hay que aplicarla en Supabase** (SQL Editor, como postgres, y
  `notify pgrst, 'reload schema';`). Hasta entonces «Crear clase puntual»
  fuera del horario responde 503; dentro de una ventana abierta funciona.
  No se ha probado contra la Supabase real (solo en Postgres aislado).
- No se sabe si el rol `postgres` de Supabase puede usar
  `session_replication_role`; si no, la 011 lo avisa y se aplica sin la
  prueba de CHECK (el resto de comprobaciones sí se hacen). Si luego un CHECK
  rechazara la ventana, cada clase puntual daría 500 y no quedaría nada
  escrito.
- Si la respuesta se pierde después del commit (red), el entrenador ve un
  error pero la clase está creada; al reintentar le sale «franja ocupada» y
  la ve en el calendario al recargar.
- La purga de huecos legacy (`lib/availability/cleanup.ts`, manual y bajo
  demanda) no coge el cerrojo de la 011. Solo afecta a ventanas manuales
  creadas antes del 20/09/2026 y sin reserva viva: si una de ellas fuera
  además `blocked` y se reutilizara para una clase puntual justo mientras
  la purga está en marcha, su DELETE esperaría al `FOR UPDATE` de la función
  y después chocaría con la FK de `reservations` (o, si en la base real esa
  FK fuera ON DELETE CASCADE, borraría la reserva nueva: no se ha podido
  comprobar sin tocar Supabase). Las ventanas puntuales nuevas no entran en
  ese criterio.

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
