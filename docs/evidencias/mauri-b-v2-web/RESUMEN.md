# Mauri · implementación web de la propuesta B v2 (issue #31, PR #35)

## Estado inicial (01/10/2026, antes de editar)

- **Mock aprobado por Dani:** `nimbalyst-local/mockups/mauri-opcion-b-pista.mockup.html` en la rama `design/mauri-propuestas-hifi-20261001`, commit `f1d93f385859a41ac244ed6c7daa4e8a32bd0d1e`, SHA-256 del archivo `b71098e620b1034ec95e69cd75e25796ee2860fed553434180b2c6910094ddf0`. Es solo referencia: no se modifica.
- **PR #35:** abierto hacia `develop`; head remoto `feature/mauri-editorial-pr1-20260929` = `f84b5bfdc1e78db4595540d54d8d57156c9234b7`.
- **Worktree de esta tarea:** `trainer-booking-platform-develop-clean_worktrees/mauri-b-v2-web-20261001`, rama local `feature/mauri-b-v2-web-20261001` creada en `f84b5bf`; se sube al mismo PR con `git push origin HEAD:feature/mauri-editorial-pr1-20260929`. El worktree original del PR (`mauri-editorial-pr1-20260929`, limpio) y `develop` (con cambios locales ajenos) no se tocan.
- **Servidor local:** `npx next dev -p 3012` en este worktree (el 3001 lo usa otra copia). `.env.local` es un enlace al de la copia principal, ignorado por Git.
- **Capturas «antes»** (`antes-*.png`, [métricas](metricas-antes.json)): en escritorio el resumen termina 23 px por debajo del calendario con 1 hora y 102 px con 3 horas (defecto señalado por Dani). Solo lecturas `GET` contra la base; el único error de consola es el 404 de `favicon.ico`, previo.

## Qué se implementó (propuesta B v2 en `/mauri`)

| Zona | Cambio |
| --- | --- |
| Cabecera nueva (`MauriHeader`) | Grafito fija: marca, «Agenda», «Clases y precios», **«Entrar / Crear cuenta»** (móvil «Entrar») y «Reservar». Con sesión: avatar + «Tu cuenta»; perfil incompleto: «Completar perfil». |
| Hero (`PremiumHero`) | Grafito con la foto real a la derecha (a sangre en móvil), nombre en condensada con apellido en contorno, entradilla serif, «Ver horarios» y «Clases y precios», datos reales: duraciones del entrenador y descuento máximo por volumen. |
| Agenda (`EasyWeekSelector`, variante `editorial`) | Fecha a la izquierda y flechas juntas; días en columnas con etiqueta, número y «N libres» / «Sin horas» (móvil «N» / «—») alineados; día elegido en grafito con barra turquesa; horas en píldoras agrupadas «Mañana» / «Tarde»; elegida en turquesa con check. Misma navegación, mismo minicalendario, mismas reglas. |
| Resumen (`BookingSummaryCard`, variante `editorial`) | Grafito; filas fecha / hora inicio–fin / quitar; precio y descuento reales; «Es una solicitud…»; **misma línea inferior que el calendario** en escritorio con 0, 1 y 3 horas (antes +23 y +102 px). |
| Paso de selección (`BookingStep1_SelectSessions`, variante `editorial`) | Títulos editoriales, duración en segmento propio, cuadrícula `stretch`, barra compacta móvil grafito/turquesa que se oculta cuando se ve al menos la mitad del resumen. |
| Oferta (`OfferSection`, nueva) | «Clase privada» con el precio de 1 jugador **leído de `trainer_session_prices`** (el mismo que usa el checkout; sin precio configurado no se pinta cifra), descuento por volumen −10 % / −15 % (`SESSION_DISCOUNTS`) y los tres pasos «Eliges hora → Mauri confirma la pista → Confirmación». |
| Pie | Grafito, marca y «Ver horarios». |
| Tipografía | `next/font`: Barlow Condensed (títulos) y Newsreader (entradillas); texto con la fuente actual. Solo el h1 del hero supera `text-3xl` (regla de `CLAUDE.md`); el mock usaba títulos de sección más grandes y se ajustaron a la regla. |
| Movimiento | Hero con entrada CSS `motion-safe`; secciones con `Reveal` (ocultado solo con `prefers-reduced-motion: no-preference`); fundido de horas al cambiar de día y pulso al elegir hora (`motion-safe`). Con movimiento reducido no se anima ni se oculta nada (comprobado). |

**Alcance de componentes de reserva:** `components/booking/*` es referencia del proyecto. Los cambios son **opcionales y aditivos**: prop `variant` (por defecto `'default'`, idéntico a antes) y prop `onLiveSelection` en `BookingFlow`. Solo `/mauri` pasa `variant="editorial"`; la página genérica `/[trainerSlug]` sigue igual. El checkout (`BookingCheckout`, en inglés y con azul) **no se ha tocado**.

## Secciones ocultas y por qué

| Sección del mock | Estado | Motivo |
| --- | --- | --- |
| Cinta de sponsors y bloque de sponsors a mitad de página | Oculta | No hay logos ni marcas autorizados (dependen de #32). |
| Club en la cabecera del calendario | Oculto | Club no confirmado. |
| «Sobre Mauri»: bio, credenciales, redes | Oculto | `trainers.bio` procede de un seed sin verificar; no hay credenciales ni redes aprobadas. |
| Paquetes de 5 / 10 clases | Ocultos | No se pueden contratar desde la web. |
| «Pista incluida», «pago en efectivo» | No se afirman | Son reglas del piloto, pero la web no las muestra ni las aplica todavía. |
| Precios 1 h / 1 h 30 | **Visibles** | Salen de `trainer_session_prices` (configuración del entrenador, la misma fuente que el checkout). En local muestran RM 400 / RM 450: **Dani debe confirmar que son los precios reales de Mauri antes de publicar.** |

## Login: qué hace y límites

- «Entrar» y «Completar perfil» de la cabecera **no pierden la selección**: con horas elegidas guardan el mismo borrador no sensible que el checkout (`lib/booking/account-entry.ts` → `lib/booking/draft.ts`) y van a `/cuenta/entrar?trainer=mauri&draft=<uuid>`. Sin JS o sin horas, enlace normal. **No se ha modificado la autenticación** ni ningún contrato.
- Comprobado en navegador: el enlace lleva `&draft=`, el borrador solo contiene fecha/hora/duración/jugadores, y `/mauri?draft=<uuid>` restaura la hora en «Review your booking» (es el comportamiento existente al volver del login).
- **No comprobado:** un login real de punta a punta (enlace mágico / Google) desde la cabecera; requiere cuenta de prueba. Al volver, el flujo existente abre directamente el checkout (no la agenda). La cabecera «con sesión» se capturó simulando la respuesta de `/api/player/me` solo en el navegador.
- «Tu cuenta» (con sesión) lleva a `/cuenta` y ahí no se conserva la selección: es una salida voluntaria; si se quiere conservar, es otro PR.

## Coherencia navegador → API → reglas → SQL

Sin cambios de API, payload, reglas ni SQL. `BookingFlow` sigue construyendo el mismo `POST /api/reservations` con `Idempotency-Key` y reintento con la misma clave; el servidor recalcula precio, revalida disponibilidad y crea con la rpc `create_booking_request`; un fallo sin respuesta sigue siendo «sin confirmar». El borrador restaurado se revalida contra `/api/availability` y después en el servidor. La oferta lee `trainer_session_prices` en el servidor con `getSupabaseServerClient()` (solo lectura). Durante las pruebas solo hubo peticiones `GET`; ninguna escritura (comprobado en el recorrido). Pruebas existentes de ruta, idempotencia y one-off en verde.

## Capturas «después» (escritorio 1440×900, móvil 390×844 @2×, movimiento reducido salvo «primera pantalla»)

| | Escritorio | Móvil |
| --- | --- | --- |
| Página completa | [antes](antes-escritorio-pagina-completa.png) → [después](despues-escritorio-pagina-completa.png) | [antes](antes-movil-pagina-completa.png) → [después](despues-movil-pagina-completa.png) |
| Primera pantalla | [antes](antes-escritorio-primera-pantalla.png) → [después](despues-escritorio-primera-pantalla.png) | [antes](antes-movil-primera-pantalla.png) → [después](despues-movil-primera-pantalla.png) |
| 0 horas | [antes](antes-escritorio-reserva-0h.png) → [después](despues-escritorio-reserva-0h.png) | agenda [antes](antes-movil-agenda-0h.png) → [después](despues-movil-agenda-0h.png) · resumen [antes](antes-movil-resumen-0h.png) → [después](despues-movil-resumen-0h.png) |
| 1 hora | [antes](antes-escritorio-reserva-1h.png) → [después](despues-escritorio-reserva-1h.png) | agenda [antes](antes-movil-agenda-1h.png) → [después](despues-movil-agenda-1h.png) · resumen [antes](antes-movil-resumen-1h.png) → [después](despues-movil-resumen-1h.png) |
| 3 horas | [antes](antes-escritorio-reserva-3h.png) → [después](despues-escritorio-reserva-3h.png) | agenda [antes](antes-movil-agenda-3h.png) → [después](despues-movil-agenda-3h.png) · resumen [antes](antes-movil-resumen-3h.png) → [después](despues-movil-resumen-3h.png) |
| Cabecera sin sesión | [después](despues-escritorio-sin-sesion.png) | [después](despues-movil-sin-sesion.png) |
| Cabecera con sesión (simulada) | [después](despues-escritorio-con-sesion.png) | [después](despues-movil-con-sesion.png) |
| Vuelta con `?draft=` | [después](despues-escritorio-vuelta-login.png) | [después](despues-movil-vuelta-login.png) |

Métricas: [antes](metricas-antes.json) · [después](metricas-despues.json). Las «3 horas» son 09:00, 10:00 y 16:00 del mismo día porque en esa semana solo un día tenía horas libres. La disponibilidad es la de la base en ese momento.

**Revisión visual y correcciones:** cabecera, hero, agenda, resumen y oferta revisados en cada tamaño. Corregido: costura de la foto bajo el nombre en el hero móvil (degradado más largo); «−10 % / −15 %» a `text-3xl` para cumplir la regla de tamaños; orden `dt`/`dd` válido; aserción débil del test. Sin desbordamiento horizontal en ningún estado.

## Pruebas

| Comprobación | Resultado |
| --- | --- |
| `node scripts/verify-mauri-landing.mjs` (nuevo) | 8/8 |
| `verify-player-entry` · `verify-a2` · `verify-calendar-interaction` · `verify-selection-overlap` · `verify-past-dates` | 27/27 · 25/25 · 12/12 · 10/10 · 12/12 |
| `verify-reservations-route` · `verify-booking-idempotency` · `verify-one-off` · `verify-codex-fixes` | 20/20 · 20/20 · 18/18 · 15/15 |
| [Recorrido en navegador](probar-recorrido.mjs) ([resultado](recorrido-resultado.txt)) | 22/22: Entrar con `&draft=`, borrador sin datos personales, vuelta restaurada, cabecera con sesión, sin escrituras, sin errores JS, movimiento reducido |
| `npm run type-check` | 11 errores, **los mismos previos** (`app/api/admin/setup-mauri`, `components/trainer/AvailabilityCalendar`, `components/trainer/BookingSection`, `components/trainer/calendar/TimePickerDropdown`); 0 en archivos de este cambio |
| `npm run build` | «Compiled successfully»; después falla por esos mismos 11 errores de tipos previos |
| `npm run lint` | Falla previa: `next lint` → «Invalid project directory provided …/lint» |
| `git diff --check` · greps de `CLAUDE.md` (sombras, `border-l-4`, emojis) | Limpios |

Revisión independiente: **pendiente** (Codex). Sin merge ni deploy.

**Revalidación sobre el head `c51bcea` (01/10):** repetidas todas las pruebas (167/167 en los 10 scripts), el recorrido en navegador (22/22) y las capturas «después» en escritorio y móvil con 0, 1 y 3 horas: sin desbordamiento; calendario y resumen con el mismo borde inferior en escritorio (1419/1419 px con 0 y 1 hora, 1453/1453 con 3). Solo cambian unos bytes en dos PNG regenerados (mismas dimensiones y contenido) y los identificadores aleatorios de borrador del recorrido. `type-check`, `build` y `lint` dan los mismos fallos previos descritos arriba; `git diff --check` limpio.
