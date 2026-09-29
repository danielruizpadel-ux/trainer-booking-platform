# Centro de coordinación

- Proceso · H0 — Probar el Centro de coordinación #tarjeta[id:tar_01M3R1C2D3E4F5G6H7J8K9M0NP status:lista priority:high created:2026-09-29 tags:proceso,h0,agentes linea:proceso hito:h0]
  Resultado esperado: Dani pregunta por el estado en una sesión «Centro del proyecto», elige una tarjeta y recibe un único siguiente paso; otro agente puede retomar la misma tarea sin perder contexto.
  - [Guion del Centro](../../docs/CENTRO_DE_COORDINACION.md) · [Protocolo común](../../docs/CONTROL_DEL_PROYECTO.md).
  - Prueba: abrir una sesión nueva en Nimbalyst desde `develop` actualizado; leer tablero y PR, dar cuatro líneas de estado y preparar un pase sobre una tarjeta existente.
  - Probar un relevo Claude ↔ Codex cuando ambos estén disponibles y el caso en que uno agota créditos. Comprobar qué envío entre sesiones permite realmente Nimbalyst; hasta entonces usar el pase listo para pegar.
  - Próxima mejora pedida por Dani: invocar `/cerebro registra …` **desde la sesión donde esté desarrollando** con Claude o Codex. El agente identifica la tarjeta activa, resume el hallazgo (hecho, idea, decisión pendiente o error), adjunta evidencia/captura y lo escribe en esa tarjeta o su documento dueño, dentro de la rama de tarea; enseña el diff y lo lleva al PR/GitHub para que pueda recuperarse desde otra copia. `/cerebro estado` consulta el tablero y PR vigentes. Probar ambos activadores en Nimbalyst; un único guion fuente en `docs/CENTRO_DE_COORDINACION.md`. No afirmar que otro chat recibió el mensaje automáticamente ni que un hallazgo local sin subir está compartido.
  - Cierre: Dani confirma que entiende el estado y encuentra el resultado en otra copia actualizada. Registrar límite o fricción observados sin inventar automatización.
