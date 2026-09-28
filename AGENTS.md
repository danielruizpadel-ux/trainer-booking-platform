# Cómo trabajar en este proyecto

Lee `CLAUDE.md` antes de modificar código y consulta `docs/PLAN_MAESTRO_PRODUCTO_Y_ENTREGA.md` para el mapa de producto y el protocolo visual. Los detalles técnicos viven en los documentos dueños del área; cuando un documento contradiga el código o la base vigente, verifica y registra la diferencia.

## Primera respuesta al recibir una tarea

1. Explica en español y en palabras sencillas qué objetivo persigue Dani, qué se podrá ver al terminar y dónde se probará.
2. Identifica la carpeta, rama y SHA actuales, cambios sin guardar, archivos relevantes y tareas en curso. No cambies de rama ni limpies archivos ajenos por comodidad.
3. Separa **comprobado**, **propuesta** y **decisión de Dani**. No conviertas un ejercicio para probar el protocolo en una decisión comercial.
4. Si hay alternativas que afectan dinero, clientes, acceso o publicación, muestra un caso real y registra la elección antes de construir.

## Una tarea de principio a fin

- Mantén una tarjeta Markdown versionada si se usa Nimbalyst; guarda junto a ella el tipo de tracker en `.nimbalyst/trackers/`. Una tarjeta solo local no está respaldada en GitHub.
- Una tarea de código comienza desde la base declarada en el plan (actualmente `develop`, sujeto a verificar SHA). Usa rama o worktree aislado y no toques trabajo no integrado de otros.
- Claude puede analizar e implementar; Codex puede revisar independientemente cuando esté disponible. Si Claude alcanza su límite, Codex puede implementar una tarea acotada y registrar que la revisión independiente sigue pendiente. No simules una revisión cruzada.
- Antes de cerrar, revisa diff, comprueba los casos relevantes, captura el resultado visible y enlaza commit/PR. Si hay imágenes de producto, verifica que están versionadas. No marques Hecha hasta integrar en la base declarada y comprobarla allí.
- Un commit, backup o PR no es despliegue. Para publicar, aplica la checklist de `docs/ANTES_DE_PUBLICAR.md` y verifica el entorno real. No subas `.env.local` ni secretos.

## Comunicación con Dani

Empieza cada sesión con cuatro líneas: **integrado**, **en revisión**, **necesita decisión**, **siguiente paso**. Evita instrucciones de Git si puede tomar la decisión mirando una pantalla, una tarjeta o un diagrama. Tras una corrección de Dani, actualiza la tarjeta y la decisión duradera antes de continuar.
