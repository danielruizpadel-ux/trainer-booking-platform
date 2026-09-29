# H0 · Vínculo entre tarjeta y sesión (29/09/2026)

## Comprobado

- `tracker_get` encontró la tarjeta «Proceso · H0 — Probar el Centro de coordinación» por su ID estable `tar_01M3R1C2D3E4F5G6H7J8K9M0NP`, aunque antes de la consulta el índice del tracker estaba desactualizado.
- La sesión **existente** «Estado de H0 consulta» (`65c62f3f-f545-4557-a6c8-e0f2133ea1be`) quedó vinculada a esa tarjeta. Una consulta posterior de `tracker_get` mostró ese ID en **Linked Sessions**; `get_session_coaching_signals` mostró el ID de la tarjeta en `linkedTrackerItemIds` de la sesión. Así se comprobó la relación en ambos sentidos.
- La sesión consultada estaba en fase `planning`, tenía dos turnos y no había editado archivos. Su comprobación anterior detectó cambios locales ajenos en `nimbalyst-local/tracker/tarjetas.md` y siete PNG sin seguimiento. Esta nota se preparó en una rama y un worktree nuevos desde `origin/develop` (`7899eb96c05b4f6842b2a27b15bdf29ea04d43f6`), sin tocar esas rutas.

## Alcance y límite

El hallazgo prueba que la tarjeta se recuperó por ID y que la relación con la sesión quedó registrada en las dos vistas consultadas. No prueba que el índice se actualice siempre de inmediato ni que la relación viaje automáticamente a otra copia. La clave local que muestra el tracker (`TRB.4`) es privada de este proyecto en esta máquina: **no es una clave compartida** ni sirve como referencia pública. Vincular una sesión mediante el tracker **no publica** la tarjeta ni la sesión en GitHub. Esta nota solo estará disponible en GitHub al subir su commit y seguirá propuesta hasta que se integre el PR.

No se cambió interfaz, contrato de API, autenticación, datos, migraciones ni despliegue. No se tomó ninguna decisión comercial.
