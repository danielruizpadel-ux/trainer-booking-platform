# Centro de control del proyecto

Este es el **punto de entrada para Dani y los agentes**, cualquiera que sea la carpeta del proyecto que esté abierta. Fecha de creación: 28/09/2026. Las referencias a ramas, PR y versiones cambian: comprobarlas al comenzar cada sesión.

## El mapa en una pantalla

| Lugar | Qué contiene | Cuándo se actualiza |
| --- | --- | --- |
| `main` | Versión aceptada y copia compartida de este centro de control. | Tras revisión de documentos o integración de un conjunto de funciones. Confirmar antes si un merge dispara despliegue. |
| `develop` | Versión de trabajo común, creada desde el trabajo avanzado de integración. | Al reunir PR de tareas revisadas y al traer cambios compartidos de `main`. |
| Rama de tarea | Una función, investigación o corrección aislada. | Mientras la tarea está activa; PR hacia la base declarada. |
| Carpeta del Mac / clon / worktree | Una copia de una rama. No es fuente independiente de verdad. | Solo ve cambios de GitHub al actualizarla; puede contener trabajo local sin respaldar. |

**Relación real:** una rama es una versión del mismo repositorio, no una carpeta que haya que pegar con otra. Las decisiones y los archivos compartidos llegan a todas las copias mediante PR y actualización de Git. Nunca fusionar dos carpetas manualmente ni suponer que Nimbalyst sincroniza automáticamente dos worktrees.

```mermaid
flowchart TD
  A["Centro de control en main"] --> B["develop: trabajo reunido"]
  B --> C["Rama de tarea + PR"]
  C --> B
  B --> D["PR borrador hacia main"]
```

## Dónde mirar y escribir cada cosa

| Si necesitas… | Abre / actualiza… |
| --- | --- |
| Saber qué hacer y dónde estamos | `ROADMAP.md` y el [plan maestro](PLAN_MAESTRO_PRODUCTO_Y_ENTREGA.md) |
| Recordar por qué decidimos una regla | `DECISIONS.md`; una decisión, fecha, ejemplo y efecto |
| Ver lo que está realmente integrado | `docs/estado-desarrollo.md` en `main`; `docs/estado-integracion.md` existe en `develop`. Confirmar siempre el PR y los commits de la rama consultada. |
| Ver pendientes en Nimbalyst | `nimbalyst-local/tracker/tarjetas.md` + `.nimbalyst/trackers/tarjeta.yaml` cuando ambos hayan sido incorporados a la rama |
| Saber cómo trabajar con agentes | `AGENTS.md`, `AI_WORKFLOW.md`, `.claude/commands/nueva-tarea.md` y `cerrar-tarea.md` |
| Cambiar reservas, datos o despliegue | `docs/BOOKING_FLOW.md`, `docs/DATABASE.md`, `docs/ANTES_DE_PUBLICAR.md` y código actual |

Evitar documentos paralelos para la misma regla. Una tarjeta apunta a su documento dueño, decisión, rama, PR, prueba y captura; el documento dueño explica la regla duradera. El tablero **muestra** el trabajo, pero GitHub guarda los Markdown y assets versionados.

## Evidencia visual de cada cambio

Para una tarea que modifica pantallas, crear `docs/evidencias/<id-de-tarjeta>/` en la **misma rama de la tarea**. Guardar allí `antes.png` y `despues.png` si aportan valor y un `resumen.md` corto con: objetivo, ruta de la pantalla, qué decidió Dani, commit/PR, comprobación en escritorio y móvil, y pendientes. Enlazar esa carpeta desde la tarjeta Nimbalyst y el PR. Si se itera, añadir una captura nueva con nombre descriptivo y actualizar el resumen; la decisión duradera también se registra en `DECISIONS.md` o el documento dueño. Las imágenes que usa la web van en `public/` junto al código que las referencia; las capturas de evidencia quedan en `docs/evidencias/` y no se publican en la interfaz.

Antes de confirmar imágenes, ocultar datos reales de clientes, claves, correos privados o pantallas de administración sensibles. Comprobar que los archivos elegidos se incluyen en el diff y en GitHub tras subir la rama. Una imagen enviada por chat o visible en Nimbalyst no se comparte automáticamente entre copias. Si no hay captura útil, describir la prueba en el resumen en vez de fabricar una.

## Rutina sin perder conocimiento entre carpetas

1. **Al abrir:** comprobar rama y SHA, cambios locales sin guardar y últimos PR. Mostrar a Dani «integrado / para revisar / por decidir / siguiente».
2. **Al investigar:** anotar pregunta, fuentes y fecha, comportamiento real de nuestra web, alternativas y lo no comprobado. Dibujar solo el recorrido útil y registrar decisión en `DECISIONS.md`.
3. **Al desarrollar:** crear tarea desde `develop` actualizado; un agente implementa, otro revisa si el riesgo lo requiere. La tarjeta y el código viajan juntos por PR hacia `develop`.
4. **Al cambiar la forma de trabajar:** proponer documentos o comandos desde una rama de documentación hacia `main`. Una vez aceptados, incorporar `main` a `develop` revisando conflictos. Así llegan también a las siguientes ramas.
5. **Al preparar una versión aceptada:** comparar `develop` con `main` en [PR borrador #3](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/3), comprobar riesgos reales, y solo entonces integrar. Esto también lleva a `main` las decisiones nuevas nacidas en `develop`.
6. **Al abrir otra carpeta:** traer la rama vigente del repositorio; comprobar el contenido y las imágenes en esa carpeta antes de concluir que se perdió trabajo.

**Regla de reciprocidad:** cambios compartidos de protocolo viajan `main → develop`; trabajo de producto validado viaja `develop → main`. Ambos movimientos son PR o merges revisados; no hay sincronización mágica por abrir una carpeta. Las copias locales se actualizan después. Mientras un PR está abierto, enlazarlo como «propuesto» y no describir su contenido como integrado.

## Límite observado del commit en Nimbalyst

En la prueba de la reserva de Mauri, el chat de Nimbalyst estaba abierto en el clon `test/nimbalyst-estado-compartido`, mientras el código se editó en el worktree aislado `/Users/dani/worktrees/mauri-reserva-facil`. La vista de cambios mostró archivos del segundo, pero el botón de commit actuaba solo sobre la carpeta abierta y pidió cambiar de proyecto. **Regla operativa:** el agente confirma ruta, rama, base, diff y archivos sin seguimiento del worktree dueño; usa Git desde esa ruta concreta para añadir solo los archivos de la tarea, confirmar y subir su rama, o abre ese worktree en Nimbalyst si Dani prefiere la interfaz. No hacer commit del proyecto que está abierto solo porque sea el que muestra el chat. Tras subir, comprobar archivos y commit del PR en GitHub y enlazarlo desde la tarjeta. Esta limitación queda pendiente de reevaluar antes de adoptar Nimbalyst como interfaz única.

## Aprendizaje de la primera revisión de producto

La revisión del PR #5 detectó un caso que no mostraban las capturas iniciales: al cambiar de semana con las flechas, la cabecera puede mostrar fechas nuevas mientras el día enfocado y las horas pertenecen a la semana anterior. **Regla del protocolo:** además de comparar antes/después en escritorio y móvil, recorrer las transiciones que cambian estado (flechas, minicalendario, duración, selección de varias clases y regreso). La evidencia debe decir qué se comprobó y qué quedó pendiente. Un error encontrado vuelve a la misma rama de tarea y se revisa de nuevo en el mismo PR antes de integrar.

## Estado de implantación

- `develop` ya existe, sin despliegue ni cambios en `main` por crearlo.
- Este PR de documentación reúne el tablero Markdown y su configuración con el protocolo para que ambos se acepten juntos en `main`. El [PR #2](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/2) fue la prueba aislada: un clon nuevo mostró INP.2 y sus etiquetas; todas las columnas y los assets aún necesitan prueba.
- [PR #5](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/5) incorporó la reserva fácil de Mauri a `develop` (merge `6d179340`, 29/09). Se probó la navegación semanal en el Mac; la reserva real sigue sin probarse.
- [PR borrador #3](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/3) conecta `develop` con `main`; no implica aceptación ni publicación.
- Este centro de control y el tablero ya están en `develop` mediante [PR #6](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/6) (squash `3771c24d`, 29/09), junto con la reserva fácil de Mauri. Este PR #4 sigue **propuesto para `main`**. Antes de integrarlo hay que comprobar si un merge en `main` activa un despliegue externo; la ausencia de workflows en GitHub no lo demuestra. El plan maestro distingue lo observado, las propuestas y lo pendiente de Dani.
