# Mauri · primera landing Editorial

**Decisión de Dani:** grafito y marfil, hero más corto, agenda antes; ocultar reseñas, masterclasses, botones y contactos de ejemplo. No mostrar clubes, sponsors, paquetes ni precios inventados. [Issue #31](https://github.com/danielruizpadel-ux/trainer-booking-platform/issues/31).

**Base y entorno:** `origin/develop` `7899eb96c05b4f6842b2a27b15bdf29ea04d43f6`, worktree aislado, `http://localhost:3011/mauri`, Chrome local. Capturas del estado inicial cargado con foto y agenda visibles, `prefers-reduced-motion: reduce`, desplazamiento completo para cargar contenido y vuelta arriba. No hay datos privados en las imágenes. Ninguna reserva enviada.

| Vista | Antes | Después | Inicio de agenda | Inicio de resumen |
| --- | --- | --- | --- | --- |
| Escritorio 1440×900 | [1440×3567](before-desktop.png) | [1440×1849](after-desktop.png) | 900 → 594 px | Resumen lateral junto al calendario |
| Móvil 390×844 | [390×5378](before-mobile.png) | [390×2267](after-mobile.png) | 844 → 514 px | 1663 → 1317 px, aproximadamente |

**Revisión móvil del PR #35:** [página completa actualizada](revision-mobile-full.png) · [09:00 elegida y resumen compacto visible](revision-mobile-selected.png) · [panel completo tras «Ver resumen»](revision-mobile-summary.png). Las tres capturas usan 390×844, la misma página local y movimiento reducido; solo se ocultó el indicador de desarrollo de Next, ajeno al producto. [Mediciones del navegador](revision-mobile-metrics.json).

Con 09:00 elegida, la hora ocupa y=960–1004 y el título del panel completo empieza en y=1317: la separación original es 313 px de documento. En la captura de selección (scroll y=420), la hora ocupa y=540–584 del viewport y el resumen compacto aparece en y=772–832: quedan 188 px entre ambos, sin desplazarse para conocer la selección. Al pulsar el enlace, el panel completo aparece desde y=40 del viewport y la barra compacta se oculta. La posición del panel completo no se altera y las horas siguen todas disponibles para seleccionar otras clases.

Las coordenadas son desde arriba de la página y corresponden a la carga observada el 29/09/2026; la disponibilidad cambia con el tiempo. Los cuatro PNG iniciales y las tres capturas de revisión están versionados en esta rama. La foto `public/trainers/mauri/hero.jpg` ya estaba versionada.

**Alcance comprobado:** se modifica la composición de `/mauri`, el hero, la envoltura visual de la agenda, el pie y la presentación del paso de selección para mostrar el resumen compacto. `BookingFlow`, `EasyWeekSelector`, checkout, API, SQL y payloads siguen iguales. Las masterclasses y reseñas de ejemplo quedan sin montar en la página. El único precio visible es el que ya devuelve `GET /api/pricing` desde `trainer_session_prices`, configurado en “Public pricing”; esta entrega no añade importes ni paquetes.

**Pruebas:** `node scripts/verify-calendar-interaction.mjs` 12/12. Navegador: flechas de semana 28 sep–4 oct → 5–11 oct → 28 sep–4 oct; minicalendario abrió; duración cambió a 1 h 30 min; en carga nueva se seleccionaron 09:00 y 10:00 y el resumen mostró dos sesiones. No se pulsó “Continuar” ni se envió solicitud. `npm run build` compiló y falló después en errores de tipos de `app/api/admin/setup-mauri` y `components/trainer/*`, ajenos al diff; `npm run type-check` mostró los mismos errores, sin errores en archivos modificados. `npm run lint` falla por script anterior `next lint` con “Invalid project directory provided .../lint”; ESLint directo tampoco encuentra `eslint.config.*`. `git diff --check` pasa.

**Revalidación tras la revisión:** `node scripts/verify-calendar-interaction.mjs` 12/12. En navegador, 09:00 y 10:00 muestran dos clases tanto en el panel como en el resumen compacto; cambiar a 1 h 30 vacía la selección y retira la barra. «Ver resumen» lleva al panel completo y oculta el compacto. `npm run build` vuelve a compilar y se detiene en los mismos 11 errores de tipos de archivos ajenos; `npm run type-check` da los mismos 11. `npm run lint` conserva el fallo de `next lint` descrito arriba. Ninguna solicitud enviada.

**Login pendiente:** en navegador se eligió 09:00, el enlace de cuenta existente llevó a `/cuenta/entrar?trainer=mauri` sin `draft`; al volver a `/mauri`, el resumen estaba vacío. Por eso no se añade login nuevo a la cabecera en este PR. La entrada del checkout guarda un borrador por separado; falta diseñar y probar la conservación desde cabecera, con revisión independiente antes de integrar.

**Tarjeta:** la duplicada `tar_351Y7S6XX5FRTV9QR139AZBFHY` se retiró de `nimbalyst-local/tracker/tarjetas.md`; la existente `tar_01M3Q7D4K2F9AX6RB5T8V0C1ZE` conserva la investigación y añade PR, issue y capturas. PR #34 también modifica el archivo del tracker y se revisará al integrar.

**Estado:** [PR #35](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/35) abierto hacia `develop` como base visual parcial, pendiente de aceptación explícita de Dani. La issue #31 sigue abierta. Sin merge, despliegue ni reserva real.
