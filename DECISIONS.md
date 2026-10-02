# DECISIONS

This file records durable project decisions so future AI agents do not repeatedly reconsider the same architectural choices.

## Decision 001 — GitHub is the shared source of truth
**Status:** Active

The GitHub repository on `main` is the shared source of truth for the project.

AI agents must not treat their own conversation history or local assumptions as authoritative.

## Decision 002 — Existing architecture is preserved
**Status:** Active

The existing application should be extended rather than casually rebuilt.

Before changing architecture, the relevant implementation and documentation must be inspected.

## Decision 003 — CLAUDE.md remains the project rulebook
**Status:** Active

CLAUDE.md contains project-specific development constraints and must be read before making code changes.

## Decision 004 — Database documentation is authoritative
**Status:** Active

`docs/DATABASE.md` is the documented database source of truth.

Do not invent schema details from memory.

## Decision 005 — Secrets stay outside Git
**Status:** Active

Environment secrets belong in local environment configuration and must never be copied into source files, documentation or commits.

## Decision 006 — AI agents have roles, not ownership
**Status:** Active

Claude, Codex, Gemini and ChatGPT may have different operational roles, but none of them individually owns the project.

The repository and documented decisions remain authoritative.

## Decision 007 — Changes should be incremental
**Status:** Active

Prefer small, understandable changes over large rewrites.

Every meaningful change should be reviewable through Git.

## Decision 008 — Primera landing Editorial de Mauri
**Status:** Active · 29/09/2026 · [issue #31](https://github.com/danielruizpadel-ux/trainer-booking-platform/issues/31)

Dani eligió grafito y marfil, un hero más corto y la agenda semanal visible antes. La primera entrega muestra la foto ya versionada y conserva el calendario y el checkout existentes. Se retiran de la vista las reseñas de respaldo, masterclasses, acciones sin destino y contactos de ejemplo. No se publican clubes, sponsors ni paquetes sin datos aprobados. La única cifra de precio visible procede del precio público vigente del entrenador que ya consulta el flujo de reserva; no se añade texto libre ni un importe fijo.

El acceso nuevo a login en la cabecera queda pendiente: la navegación directa a `/cuenta/entrar?trainer=mauri` después de elegir una hora borra la selección al volver. La entrada desde el checkout ya tiene un mecanismo de borrador propio; un acceso de cabecera necesita conservar el mismo estado y comprobarlo antes de integrarse. Esta decisión visual no autoriza publicar, cambiar reservas ni cobrar.

**Corrección de revisión del PR #35:** esta implementación es una base parcial de la dirección Editorial; Dani todavía no ha aceptado su resultado visual ni la landing completa. Se conserva la tarjeta Mauri existente `tar_01M3Q7D4K2F9AX6RB5T8V0C1ZE` con su investigación y se elimina la tarjeta duplicada `tar_351Y7S6XX5FRTV9QR139AZBFHY`. En móvil, una selección muestra un resumen compacto junto a las horas y un enlace al panel completo, sin cambiar la selección semanal ni el contrato de reserva. La issue #31 queda abierta.

## Decision 009 — Landing de Mauri con la propuesta B v2
**Status:** Active · 01/10/2026 · [issue #31](https://github.com/danielruizpadel-ux/trainer-booking-platform/issues/31) · [PR #35](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/35)

Dani eligió la propuesta **B · Pista nocturna** y aprobó su versión 2 (mock `nimbalyst-local/mockups/mauri-opcion-b-pista.mockup.html`, rama `design/mauri-propuestas-hifi-20261001`, commit `f1d93f3`) para implementarla en `/mauri`: grafito, papel blanco cálido, azul acero `#20374D` y turquesa `#32677B` medidos en la camiseta de la foto real; títulos en condensada y entradillas en serif; calendario con días y horas distinguibles y selección clara; movimiento sutil sin animación con `prefers-reduced-motion`; acceso a cuenta visible en la cabecera sin perder la selección.

Solo se publica lo que tiene datos aprobados y funciona: sponsors, club, bio/redes y paquetes 5/10 quedan ocultos hasta tener contenido autorizado o compra funcional; el precio visible es el configurado por el entrenador en `trainer_session_prices`. El diseño se aplica como variante opcional de los componentes de reserva (`variant="editorial"`); el resto de páginas conserva el aspecto anterior. El acceso de cabecera reutiliza el borrador de `lib/booking/draft.ts` y no cambia la autenticación. Detalle y límites: `docs/evidencias/mauri-b-v2-web/RESUMEN.md`.

**Continuación de Dani tras revisar `815e892` (01/10):** no aprobó el PR para integrar. Quiere un tono claro azul acero, el recorrido posterior a «Continuar» en español y coherente con Mauri, y ver la composición completa de sponsors, club, paquetes y «Sobre Mauri» con huecos claramente pendientes. La vista local `?preview=1` solo está disponible fuera de producción. En la página normal no se atribuyen relaciones, sedes, logos, bio ni redes sin fuente verificada. El botón de Mauri dice «Solicitar reserva» y explica que Mauri confirma la pista; la cuenta obligatoria y los paquetes operativos siguen en entregas separadas. Codex implementa esta continuación por límite de Claude; aún falta revisión independiente antes de integrar.

**Corrección de Dani tras revisión del diff local (01/10):** no prometer pago en efectivo ni que Mauri propondrá otra hora; la solicitud queda pendiente de que Mauri confirme la pista. Un 409 por perfil incompleto o precio sin configurar debe explicarse según la respuesta real de la API; solo la franja ocupada invita a elegir otra hora. Cambios y pruebas permanecen sin commit en el worktree aislado para nueva revisión.
