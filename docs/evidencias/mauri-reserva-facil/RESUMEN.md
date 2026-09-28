# Mauri · Reserva fácil (prototipo visual)

Rama: `proto/mauri-reserva-facil` · Base: `origin/develop` (`7e6357e`)
Worktree: `/Users/dani/worktrees/mauri-reserva-facil` · Local: http://localhost:3020/mauri
Fecha: 2026-09-28/29 · Calendario aprobado visualmente por Dani. Cierre de fase hacia `develop`, sin merge ni deploy.

## Objetivo

Al pulsar «Reservar sesión» tiene que ser fácil encontrar y elegir una hora sin
bajar por un mes lleno de fechas pasadas. Referencia de Dani: semana compacta
arriba, horas del día seleccionado debajo y, si el día está vacío, acceso al
próximo día con huecos.

## Qué se ve ahora (después)

- **Vista inicial «Fácil»**: una semana compacta (7 días siempre a la vista,
  también a 375 px), con navegación de semana ‹ ›. Cada día marca con un punto
  si tiene horas libres (verde) o clases ya elegidas (azul); los días sin horas
  salen apagados y no se pueden pulsar.
- **Horas debajo, en el mismo panel** (sin modal): al enfocar un día aparecen
  sus horas como fichas. Al cargar se enfoca solo el primer día con horas de la
  semana; si la semana no tiene, salta a la semana del próximo día disponible.
- **«Ir / Ver el próximo día con horas»**: aparece **solo** cuando los datos ya
  cargados confirman que existe un día posterior con huecos. Si el día enfocado
  se queda sin horas, el botón es la salida; si tiene horas, queda como enlace
  secundario.
- El resumen «Tu reserva», el precio en vivo y la **elección de varias clases**
  funcionan con la misma fuente de verdad de selección.
- El botón «Reservar sesión» del hero baja al selector `#reserva`.

## Decisiones

- **No se tocan los ficheros canónicos** `components/trainer/calendar/*`.
  `BookingFlow.tsx` elimina únicamente el estado de vista que ya no se usa.
  El selector nuevo es un componente aparte y reutiliza `MiniCalendarOverlay`.
- **Sin lógica de negocio nueva**: mismo `GET /api/availability`, misma hora
  reservable (`start_time` de la API), mismo solapamiento (`overlapsSelection`,
  `lib/availability/windows`) y mismo filtro de pasado (`isPastMalaysiaSession`).
  No se tocan precios, reglas de disponibilidad, creación de reservas ni BD.
- Se adapta la idea de la referencia al sistema de Mauri (blanco + `ring-1`,
  azul de acento, sin sombras duras, sin emojis); no se copian sus colores ni su
  composición.
- La ventana de datos se calcula desde hoy o la semana visible hasta 12 semanas
  después de esta. El «próximo día con horas» usa solo datos cargados.

## Archivos cambiados

- `components/booking/EasyWeekSelector.tsx` — **nuevo**. Selector semana + horas.
- `components/booking/BookingStep1_SelectSessions.tsx` — usa una vista semanal
  única y marca `#reserva` como destino del CTA.
- `components/booking/BookingFlow.tsx` — retira el estado de vista obsoleto.
- `components/mauri/PremiumHero.tsx` — desplaza el CTA al selector.

Diff funcional solo en `components/` (evidencias aparte). Sin cambios en el
calendario canónico, en precios ni en BD. `.env.local` **no** entra en git.

## Pruebas hechas (en http://localhost:3020/mauri)

- **Escritorio (1440)**: CTA del hero → selector visible; semana 28 sept–4 oct;
  Mar 29 enfocado con su hora `09:00`; elegir hora → aparece en «Tu reserva»;
  «próximo día con horas» salta a Vie 2 oct (rejilla completa 09:00–16:00);
  segunda clase añadida → 2 sesiones, Total RM 800 y aviso de descuento;
  `09:30` tachado por solaparse con `09:00` (regla del servidor). Toggle
  «Calendario» → vuelven Mes / Semana / Día con la selección conservada.
- **Móvil (~375 px)**: los 7 días caben en una fila; horas y enlace de próximo
  día correctos.
- `tsc --noEmit`: sin errores nuevos en los ficheros tocados (la base arrastra
  errores previos en `components/trainer/*` y `app/api/admin/*`).

## Nota sobre el aviso «1 Issue»

El badge «1 Issue» del overlay de `next dev` **ya existía en la base `develop`**
(se ve en `antes-desktop.png`) y viene de avisos previos en `/mauri`
(`metadata.viewport` que debería ir en `export const viewport`, y
`images.qualities` sin el 85 configurado). **No lo introduce esta tarea.**

## Capturas (v1)

| | Antes | Después |
|---|---|---|
| Escritorio | `antes-desktop.png` | `despues-desktop.png` |
| Escritorio · varias clases | — | `despues-desktop-multiclase.png` |
| Escritorio · modo Calendario | — | `despues-desktop-calendario.png` |
| Móvil 375 px | `antes-mobile.png` | `despues-mobile.png` |

---

## v2 — Ajustes tras la revisión de Dani (2026-09-28)

1. **El CTA del hero aterriza en el selector.** «Reservar sesión» ahora baja a
   `#reserva` (el bloque de duración + semana + primeras horas), con
   `scroll-mt-4`, en vez de al aire de arriba de la sección. Verificado: en
   escritorio (1440×769) la duración queda arriba y la primera hora visible
   (top 402); en móvil (375×769), duración visible y primera hora visible
   (top 445).
2. **Se quita el selector «Fácil / Calendario».** Queda una sola vista de
   reserva: semana compacta + horas debajo, con flechas ‹ › de semana. Se retira
   el uso de `AvailabilityCalendar` del embudo (Mes/Semana/Día ya no aparecen en
   `/mauri`); el componente canónico sigue existiendo sin tocar para el resto de
   la app.
3. **Minicalendario reutilizado.** El rango de fechas es ahora un botón (con
   icono de calendario) que abre `MiniCalendarOverlay` (el mismo del calendario
   canónico, con toda su accesibilidad de teclado). Al elegir un día se cierra y
   vuelve a ESTA vista semanal, mostrando la semana correspondiente, el día
   elegido y sus horas debajo. Nunca lleva a otra pantalla ni a la vista mensual.
   Los días de hoy en adelante son elegibles (los pasados, no), incluidos días
   sin horas: al elegir uno se ve el estado «No quedan horas libres este día» con
   el salto al próximo día.

### Pruebas v2 (http://localhost:3020/mauri)

- **Día de otra semana**: desde el minicalendario, oct 15 → la vista salta a la
  semana «12 – 18 oct» con «jueves, 15 de octubre» enfocado (sin cambiar de
  pantalla).
- **Día sin horas**: ese mismo 15 oct no tiene horas → «No quedan horas libres
  este día» + botón «Ir al próximo día con horas» (13 y 16 sí tienen, con punto).
- **Teclado**: foco en el botón de rango → abre en la rejilla sobre el día
  activo; ↓/→ mueven (15→23 oct); Enter elige, cierra y devuelve el foco al
  botón. Escape cierra. (Heredado de `MiniCalendarOverlay`.)
- **Selección conservada**: navegar de semana o por el minicalendario no toca
  `selectedSessions` (misma fuente de verdad); el resumen se mantiene.
- Reglas, precios, disponibilidad y BD **sin cambios**. `tsc --noEmit` sin
  errores nuevos en los ficheros tocados.

Archivos v2: `components/mauri/PremiumHero.tsx` (scroll del CTA),
`components/booking/BookingStep1_SelectSessions.tsx` (quita toggle, `id="reserva"`),
`components/booking/BookingFlow.tsx` (deja de pasar props de vista) y
`components/booking/EasyWeekSelector.tsx` (minicalendario).

### Capturas (v2)

| | Escritorio | Móvil 375 px |
|---|---|---|
| CTA aterriza en el selector | `v2-desktop-cta-landing.png` | `v2-mobile-cta-landing.png` |
| Minicalendario abierto | `v2-desktop-minicalendar.png` | `v2-mobile-minicalendar.png` |
| Otra semana + día sin horas | `v2-desktop-otra-semana-sin-horas.png` | — |

---

## v3 — Ajustes del minicalendario (2026-09-28)

1. **Posición.** El minicalendario se abre justo debajo del botón de fecha y
   **centrado** con el texto y el icono (antes salía desplazado a la derecha). Se
   logra con un ancla centrada (`left-1/2 -translate-x-1/2`) del mismo ancho que
   el popover, que hace de contenedor de posicionamiento; el ajuste horizontal
   propio del overlay lo mantiene dentro de la pantalla en móvil. Medido:
   escritorio, centro del botón = centro del popover (538 = 538); móvil (375),
   centros 188 = 188 y caja 36–340 dentro del viewport.
2. **Disponibilidad real y por duración.** El minicalendario resalta (habilita)
   solo los días con horas libres **para la duración elegida** dentro de la
   ventana ya cargada; los cargados sin horas quedan apagados. Al cambiar de
   duración se actualiza: octubre con 1 h → 2, 6, 9, 13, 16, 20, 23, 27, 30; con
   1 h 30 → 2, 9, 16, 23, 30. Los periodos **aún no cargados** (más allá de la
   ventana; p. ej. abril 2027) **no** se pintan como días sin huecos: quedan
   elegibles y, al elegirlos, `weekStart` cambia, se recarga ese periodo y las
   horas se recalculan. La ventana de datos pasa a depender de la semana vista
   (hoy…+12 semanas por delante), recargando al navegar.
3. **Nombre accesible.** El botón que abre el minicalendario tiene
   `aria-label="Elegir fecha"` (verificado en escritorio y móvil).

Además, el enfoque automático inicial ya no pisa un día elegido a mano: si el
usuario elige un día (incluido uno sin horas), no se le mueve solo.

Se conservan la vista semanal, el resumen y las clases seleccionadas al navegar
(navegar por semanas o por el minicalendario no toca `selectedSessions`).
`tsc --noEmit` sin errores nuevos en el fichero tocado.

### Capturas (v3)

| | Escritorio | Móvil 375 px |
|---|---|---|
| Minicalendario centrado + disponibilidad real | `v3-desktop-minical-centrado.png` | `v3-mobile-minical-centrado.png` |

---

## Cierre de fase (2026-09-29)

- **Base y alcance:** `proto/mauri-reserva-facil` parte exactamente de
  `origin/develop` (`7e6357e`). El diff funcional comprende los cuatro archivos
  anteriores. Los demás archivos sin seguimiento son las 14 capturas y este
  resumen en `docs/evidencias/mauri-reserva-facil/`.
- **Recorrido repetido sin reservar:** en escritorio 1440 px, `/mauri` mostró
  la semana 28 sept–4 oct y la hora del 29 a las 09:00. Elegirla actualizó el
  resumen a 1 clase y RM 400. «Continuar · 1 clase» abrió «Review your booking»
  con entrenador, fecha, duración, jugadores, datos de contacto y total. La
  prueba se detuvo antes de «Confirm booking»: no se envió una reserva.
- **Móvil:** a 375 px, `/mauri` mostró los siete días en una fila, la hora y el
  acceso al próximo día. Las capturas antes/después y del minicalendario
  documentan el resultado aprobado.
- **Integridad:** `git diff --check` pasó. `npm run type-check` falla por 11
  errores preexistentes en `app/api/admin/setup-mauri/route.ts` y
  `components/trainer/*`; ninguno corresponde a los cuatro archivos de esta
  tarea. No se ha hecho una prueba de reserva real ni del POST que la crea.
- **Exclusiones:** `.env.local`, `.next/`, `node_modules/` y
  `tsconfig.tsbuildinfo` están ignorados. No se incluyen secretos, artefactos
  generados ni cambios del checkout ajeno `test/nimbalyst-estado-compartido`.

Las secciones v1 y v2 anteriores son el historial de decisiones y pruebas;
**la versión aprobada es v3**, con vista semanal única y minicalendario centrado.

## Corrección tras revisión de Codex (2026-09-29)

- En el PR #5 se detectó que las flechas cambiaban la semana visible pero dejaban `selectedDay` en la semana anterior; el título, las horas y el minicalendario podían quedar desalineados.
- Commit `f9b5865`: las flechas eligen el primer día con huecos conocido de la semana destino o, si no hay ninguno conocido, hoy (cuando está en esa semana) o su lunes. No cambia `selectedSessions`.
- **Verificación hecha:** revisión del diff y confirmación de que el PR sigue abierto hacia `develop` con el commit nuevo. **Pendiente:** prueba visual en el navegador del Mac, en ambas direcciones, semana sin huecos y minicalendario tras usar flechas. No se ejecutó `npm run type-check` de nuevo desde esta revisión remota. Sin reservas reales, merge ni deploy.
