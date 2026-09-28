# Tarjetas

Tablero del plan maestro (`docs/PLAN_MAESTRO_PRODUCTO_Y_ENTREGA.md`, apartado 6).
Tipo y estados definidos en `.nimbalyst/trackers/tarjeta.yaml`.
Estados: idea → por-decidir → lista → en-desarrollo → para-revisar → hecha.

- Proceso · H0 — Probar protocolo de trabajo #tarjeta[id:tar_01M3KB7Y8AYB5X5TPVS7V9G73E status:idea priority:medium created:2026-09-28 tags:proceso,h0 linea:proceso hito:h0]
  Resultado: tablero y tarjeta recuperables desde GitHub.
  - Saber si Nimbalyst conserva tareas, imágenes y decisiones al abrir el proyecto en otra copia.
  - Recorrer los estados con un cambio de texto inofensivo; adjuntar una imagen de referencia no sensible.
  - Hacer la tarea en un worktree aparte, revisar el diff y registrar una decisión o corrección de Dani.
  - Comprobar en GitHub y en otra copia que la tarjeta, la imagen y el cambio se conservan.
  - Cierre: adoptar Nimbalyst o seguir con Emdash, sin borrar ningún entorno durante la transición.
  - Prueba de recuperación, 29/09: Dani abrió un clon nuevo y limpio de `develop` en Nimbalyst; con el filtro «All» vio la tarjeta Mauri en «Hecha». Al abrirla no pudo ir a las capturas porque la descripción solo tenía una ruta de texto. Probar los enlaces añadidos arriba antes de decidir si Nimbalyst sirve para revisar evidencia visual.

- Mauri · H2 — Encontrar y reservar una hora fácilmente #tarjeta[id:tar_01M3M7C2XFWRBJDKTNF0QW03CR status:hecha priority:high created:2026-09-28 tags:mauri,h2,ux linea:mauri hito:h2]
  Resultado: semana compacta, horas debajo y minicalendario centrado para reservar con Mauri.
  - Ver: [antes en escritorio](https://github.com/danielruizpadel-ux/trainer-booking-platform/blob/develop/docs/evidencias/mauri-reserva-facil/antes-desktop.png) · [resultado en escritorio](https://github.com/danielruizpadel-ux/trainer-booking-platform/blob/develop/docs/evidencias/mauri-reserva-facil/v3-desktop-minical-centrado.png) · [resultado en móvil](https://github.com/danielruizpadel-ux/trainer-booking-platform/blob/develop/docs/evidencias/mauri-reserva-facil/v3-mobile-minical-centrado.png).
  - [Decisiones, pruebas y todas las capturas](https://github.com/danielruizpadel-ux/trainer-booking-platform/blob/develop/docs/evidencias/mauri-reserva-facil/RESUMEN.md) · [PR #5](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/5).
  - Si Nimbalyst no abre los enlaces del detalle, carpeta de capturas en GitHub: https://github.com/danielruizpadel-ux/trainer-booking-platform/tree/develop/docs/evidencias/mauri-reserva-facil
  - Aprobado visualmente por Dani; Codex corrigió el cambio de semana. Incorporado a `develop` en `6d179340`. No se envió una reserva real ni se publicó la web. `type-check` conserva 11 errores previos ajenos.
