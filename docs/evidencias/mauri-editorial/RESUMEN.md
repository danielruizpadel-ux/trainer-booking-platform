# Mauri · primera landing Editorial

**Decisión de Dani:** grafito y marfil, hero más corto, agenda antes; ocultar reseñas, masterclasses, botones y contactos de ejemplo. No mostrar clubes, sponsors, paquetes ni precios inventados. [Issue #31](https://github.com/danielruizpadel-ux/trainer-booking-platform/issues/31).

**Base y entorno:** `origin/develop` `7899eb96c05b4f6842b2a27b15bdf29ea04d43f6`, worktree aislado, `http://localhost:3011/mauri`, Chrome local. Capturas del estado inicial cargado con foto y agenda visibles, `prefers-reduced-motion: reduce`, desplazamiento completo para cargar contenido y vuelta arriba. No hay datos privados en las imágenes. Ninguna reserva enviada.

| Vista | Antes | Después | Inicio de agenda | Inicio de resumen |
| --- | --- | --- | --- | --- |
| Escritorio 1440×900 | [1440×3567](before-desktop.png) | [1440×1849](after-desktop.png) | 900 → 594 px | Resumen lateral junto al calendario |
| Móvil 390×844 | [390×5378](before-mobile.png) | [390×2267](after-mobile.png) | 844 → 514 px | 1663 → 1317 px, aproximadamente |

Las coordenadas son desde arriba de la página y corresponden a la carga observada el 29/09/2026; la disponibilidad cambia con el tiempo. Los cuatro PNG están versionados en esta rama. La foto `public/trainers/mauri/hero.jpg` ya estaba versionada.

**Alcance comprobado:** solo se modifica la composición de `/mauri`, el hero, la envoltura visual de la agenda y el pie. `BookingFlow`, `EasyWeekSelector`, checkout, API, SQL y payloads siguen iguales. Las masterclasses y reseñas de ejemplo quedan sin montar en la página. El único precio visible es el que ya devuelve `GET /api/pricing` desde `trainer_session_prices`, configurado en “Public pricing”; esta entrega no añade importes ni paquetes.

**Pruebas:** `node scripts/verify-calendar-interaction.mjs` 12/12. Navegador: flechas de semana 28 sep–4 oct → 5–11 oct → 28 sep–4 oct; minicalendario abrió; duración cambió a 1 h 30 min; en carga nueva se seleccionaron 09:00 y 10:00 y el resumen mostró dos sesiones. No se pulsó “Continuar” ni se envió solicitud. `npm run build` compiló y falló después en errores de tipos de `app/api/admin/setup-mauri` y `components/trainer/*`, ajenos al diff; `npm run type-check` mostró los mismos errores, sin errores en archivos modificados. `npm run lint` falla por script anterior `next lint` con “Invalid project directory provided .../lint”; ESLint directo tampoco encuentra `eslint.config.*`. `git diff --check` pasa.

**Login pendiente:** en navegador se eligió 09:00, el enlace de cuenta existente llevó a `/cuenta/entrar?trainer=mauri` sin `draft`; al volver a `/mauri`, el resumen estaba vacío. Por eso no se añade login nuevo a la cabecera en este PR. La entrada del checkout guarda un borrador por separado; falta diseñar y probar la conservación desde cabecera, con revisión independiente antes de integrar.

**Estado:** PR visual propuesto hacia `develop`, sin merge, despliegue ni reserva real. Revisión independiente pendiente.
