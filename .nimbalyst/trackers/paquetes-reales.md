# Mauri · H3 — Paquetes reales de 5/10 clases

**Estado:** para revisar (preparación; compra pendiente)
**Tipo:** `tarjeta` en `./tarjeta.yaml`
**Base:** `origin/develop` @ `7899eb96c05b4f6842b2a27b15bdf29ea04d43f6`
**Rama:** `feature/paquetes-reales-20261001`
**Implementa:** Codex, por límite de Claude. **Revisión independiente:** pendiente.

## Objetivo visible

Un jugador con cuenta podrá contratar un paquete de 5 o 10 clases, agendar algunas ahora y otras después, con entrenador, duración y número de jugadores fijos. Mauri verá créditos, reservas, cobro y correcciones sin duplicados. Esta rama solo prepara una barrera segura: impide registrar ventas nuevas con el descuento multihora mientras se decide el precio y se implementa el cobro. Los paquetes históricos siguen visibles y gestionables en Reservas → Packages.

## Comprobado en la base

- Ya existen `client_packages`, `package_sessions`, las rutas de dashboard y las funciones SQL de agenda. Antes del PR #36, la venta desde el dashboard creaba paquete y créditos sin registrar pago, usaba `calculateBookingPrice(5/10)` y heredaba el 10 % / 15 % del checkout multihora.
- La única ruta HTTP de creación era `POST /api/dashboard/packages`; ahora exige `requireTrainer()` y devuelve 503 sin escritura. Se retiraron `createClientPackage`, la cotización heredada y el diálogo de venta que habían quedado sin uso. `schedule_package_session` y `unschedule_package_session` conservan la gestión de créditos existentes. No hay ruta de compra desde la cuenta ni pasarela integrada para packs.
- El plan maestro recoge como dirección del piloto cuenta obligatoria, pago completo del pack el primer día, seis meses desde la primera clase impartida y cancelación inicial de 24 h configurable. No hay contrato completo de cobro, expiración, reembolso y corrección implementado para paquetes.
- `docs/PLAN_PAQUETES_Y_CALENDARIO.md` dice primero que no hay precio nuevo y hereda el descuento multihora; esa afirmación describe el prototipo interno, no valida el precio comercial del paquete real. `docs/BOOKING_FLOW.md` también describe inserciones directas antiguas; la reserva pública vigente usa RPC `create_booking_request` e idempotencia.

## Caso para decisión de Dani

Si la clase de 60 minutos de Mauri cuesta RM300, el código actual calcula RM1.350 por 5 clases. Falta decidir si el paquete de 5 tiene un precio propio configurable, si ese RM1.350 se acepta explícitamente, o si se mantiene sin venta. La elección cambia el dinero cobrado al jugador y debe quedar registrada antes de activar la compra.

**Decisiones ya documentadas para el prototipo interno:** tamaño 5/10, entrenador fijo y devolución del crédito si el entrenador desagenda una sesión (plan del 20/09).
**Pendientes para venta real:** precio de 5 y 10 por duración/jugadores; confirmación de vigencia y corrección de la primera clase; cancelación temprana/tardía y no presentación; reembolso parcial o total; transferibilidad; momento exacto de consumo/liberación de crédito; mecanismo de cobro, recibo y reintento. El plan maestro apunta a seis meses desde la primera clase y pago completo el primer día, pero estas reglas aún requieren implementación y pruebas.

## Alcance de esta rama y capas

- **Interfaz:** oculta el botón de venta; mantiene la consulta y agenda de paquetes existentes.
- **API:** `POST /api/dashboard/packages` exige sesión y devuelve 503 sin escribir; `GET` y rutas de sesión conservan su contrato.
- **Reglas de venta:** se retiran el cálculo y la creación internos que heredaban el descuento multihora. Los descuentos de varias sesiones de la reserva pública no cambian.
- **Autenticación, datos, migraciones y despliegue:** sin cambio. No se aplica SQL ni se escribe en la BD real.
- **Compatibilidad:** una versión anterior con el botón visible recibirá 503 al enviar; no creará un paquete a medias. No se activa la compra desde cuenta.

## Siguiente tramo antes de venta

Cerrar las decisiones y documentar ejemplos de cancelación y pago. Diseñar un precio de paquete independiente y configurable, snapshot de oferta, obligación de pago e idempotencia. Revisar navegador → API → reglas → SQL, incluido doble clic, respuesta perdida, dos reservas sobre un crédito, acceso cruzado, paquete vencido y versión anterior. Verificar esquema e historial del entorno destino; probar migraciones en Postgres aislado, con orden, copia de seguridad, compatibilidad y recuperación antes de proponer aplicarlas. Capturar navegador con datos de prueba y pedir revisión independiente de reservas/pagos/datos antes de integrar.

**No marcar Hecha:** no hay compra real, revisión independiente, integración en `develop` ni comprobación en entorno publicado.

## Recorrido y compatibilidad comprobados

| Capa | Estado tras este PR | Error o reintento |
| --- | --- | --- |
| Navegador | Reservas muestra paquetes anteriores y permite abrir sus sesiones; no muestra acción de venta. | Una pestaña con la versión anterior aún podría enviar el formulario. |
| API | `POST /api/dashboard/packages` comprueba sesión y responde 503 sin leer el body ni escribir. `GET` y `PATCH` de sesiones siguen disponibles. | Sin sesión, 401. Repetir el POST no crea paquetes; la versión anterior recibe el mismo 503. |
| Regla | Se retiró la creación que tomaba el 10 % / 15 % del descuento multihora. La gestión histórica sigue en `lib/packages/schedule.ts`. | El agendado existente delega la exclusión de créditos a la RPC; un crédito ocupado da 409. Una respuesta perdida requiere consultar el estado antes de reintentar. |
| SQL | Sin migración nueva. `client_packages` y `package_sessions` conservan sus registros; las funciones de agenda de 017/019 no cambian. | El esquema e historial del entorno real no se inspeccionaron en esta tarea. No se ejecutó ninguna escritura SQL. |

No hay libro de cobros de paquetes en este recorrido. No llamar «pagado» a un paquete solo por existir en `client_packages`.

## Comprobaciones en esta rama (01/10/2026)

- `node scripts/verify-a2.mjs`: 25/25 tras retirar la prueba del flujo antiguo de venta; incluye POST suspendido (503 sin escrituras, 401 sin sesión).
- `node scripts/verify-package-credit-r2.mjs`: 19/19 sobre propuesta, crédito ocupado y reserva histórica; no sustituye una prueba de base aislada.
- `npm run type-check`: falla con 11 errores previos en `app/api/admin/setup-mauri/route.ts`, `components/trainer/AvailabilityCalendar.tsx`, `components/trainer/BookingSection.tsx` y `components/trainer/calendar/TimePickerDropdown.tsx`; ninguno corresponde al diff de esta rama.
- `npm run build`: compilación completada; falla al llegar al mismo chequeo de tipos.
- `git diff --check`: limpio. No se ejecutó escritura SQL ni prueba contra la base real. La evidencia visible en navegador requiere cuenta y entorno de prueba; no se capturó una pantalla con datos de clientes.

**Instrucción provisional recibida:** Dani está consultando precios y condiciones. Continuar solo con investigación, documentación y base segura; mantener la compra/venta nueva desactivada. Esta instrucción no aprueba una tarifa ni reglas de cobro.
