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

- Mauri · H2 — Encontrar y reservar una hora fácilmente #tarjeta[id:tar_01M3M7C2XFWRBJDKTNF0QW03CR status:en-desarrollo priority:high created:2026-09-28 tags:mauri,h2,ux linea:mauri hito:h2]
  Resultado: después de pulsar «Reservar sesión», se ven una semana compacta y las horas del día sin recorrer el mes ni abrir un modal.
  - Problema observado por Dani en `localhost:3001/mauri`: el mes completo coloca las fechas útiles casi al final. Referencia visual aportada: semana, horas del día y salto al siguiente día disponible.
  - Base declarada: `develop` (confirmar SHA y nombre de la rama/worktree aislado con el agente ejecutor).
  - Corrección visual de Dani tras el primer prototipo: al pulsar «Reservar sesión», el bloque de fechas y horas debe quedar a la vista sin desplazar demasiado el calendario; mantener accesible la elección de duración.
  - Quitar el selector «Fácil / Calendario»: una sola vista semanal de fechas y horas, con semanas anterior/siguiente.
  - Al pulsar el rango de fechas o un icono de calendario, abrir un minicalendario para elegir cualquier día; cerrar el minicalendario y volver a la misma vista semanal con ese día activo y sus horas visibles.
  - Último ajuste visual de Dani (captura 22:54): el minicalendario emergente debe quedar centrado horizontalmente respecto al botón del rango de fechas e icono de arriba; ahora aparece desplazado hacia la derecha. Mantenerlo dentro del viewport en móvil.
  - Mantener selección de varias clases, resumen y reglas existentes de disponibilidad/precio; comprobar teclado, móvil y navegación entre semanas.
  - Evidencia: `docs/evidencias/mauri-reserva-facil/` en la rama del prototipo, con capturas antes/después de escritorio y móvil y resultado del recorrido.
  - Ejecutor: Claude en Nimbalyst; revisión independiente: Codex después de que Dani valide la pantalla.
  - Estado actual: prototipo local en curso; sin commit, PR ni integración confirmados.
