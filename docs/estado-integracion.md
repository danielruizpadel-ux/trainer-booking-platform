# Estado de integración — A1/A2 + A3.1 + UI

Última actualización: 25/09/2026. Worktree: `integracion-programa`.

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
