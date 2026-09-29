# Cómo trabajar en este proyecto

Empieza por `docs/CONTROL_DEL_PROYECTO.md`. Lee `CLAUDE.md` antes de modificar código y consulta `docs/PLAN_MAESTRO_PRODUCTO_Y_ENTREGA.md` para el mapa de producto y el protocolo visual. Los detalles técnicos viven en los documentos dueños del área; cuando un documento contradiga el código o la base vigente, verifica y registra la diferencia.

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

## Centro y pases entre agentes

La sesión **Centro del proyecto** usa `docs/CENTRO_DE_COORDINACION.md` para dar a Dani el estado resumido y preparar encargos. Cada tarea conserva su contexto en la misma tarjeta, el PR y el documento dueño; un chat separado no es fuente única de verdad. Antes de pasar una tarea a Claude o Codex, entregar ID, base/SHA, objetivo visible, decisión, alcance, pruebas y pendientes. Registrar qué agente implementó y quién revisó realmente.

Si uno agota créditos, el disponible continúa sin simular trabajo ni revisión del otro. Para reservas, pagos, acceso, datos o despliegue, una revisión independiente pendiente impide integrar; se puede avanzar con investigación y cambios aislados. El orquestador V1 no ofrece sustitución automática y no debe confundirse con esta coordinación.

## Integración, datos y compatibilidad

- Antes de implementar, señalar si la tarea cambia interfaz, contrato de API, autenticación, datos, migraciones o despliegue. Una tarea no se considera aislada si afecta a otra de esas capas.
- Para reservas, cobros, permisos o base de datos: revisar conjuntamente navegador → API → reglas de negocio → SQL, incluidos errores, reintentos y la versión anterior. No probar escrituras contra la base real por comodidad.
- Si hay migración, verificar esquema e historial del entorno destino y documentar orden, prueba aislada, copia de seguridad, compatibilidad de despliegue y recuperación. No asumir que los archivos de `migrations/` reflejan lo aplicado. Evitar cambios destructivos de esquema en el mismo paso que cambia el código.
- Antes del merge, enumerar resultados de build, tipos y pruebas relevantes, así como fallos previos; no afirmar que CI protege la rama si no hay workflow y regla requerida configurados. Pedir revisión independiente para cambios de alto impacto.
- Para otras aplicaciones o lenguajes, mantener contratos HTTP/JSON documentados y estables; no cambiar campos o estados públicos sin plan de compatibilidad. Para publicar, seguir además `docs/ANTES_DE_PUBLICAR.md` y comprobar el entorno real. El merge y el despliegue son decisiones distintas.

## Portabilidad de todo el proyecto

- La regla se aplica a web, API, reservas, cuentas, pagos, dashboard, datos, archivos y despliegue. En cada PR indica qué proveedor o servicio se usa, qué capas afecta y qué comportamiento debe seguir funcionando si cambia el proveedor. Consulta la [tarea transversal #33](https://github.com/danielruizpadel-ux/trainer-booking-platform/issues/33).
- Coloca acceso a base de datos, autenticación, almacenamiento y servicios externos detrás de módulos del servidor con contratos claros; evita nuevas llamadas directas al proveedor desde componentes de pantalla. Adapta gradualmente el código existente cuando se toque esa zona, sin prometer una sustitución automática.
- Conserva IDs, estados, fechas y reglas de negocio en contratos y pruebas de los recorridos afectados. Una migración real de base también debe trasladar usuarios, permisos, medios, restricciones, funciones y datos; una migración de hosting debe comprobar variables, tareas, rutas, secretos y almacenamiento.
- Antes de cambiar proveedor, inventaría dependencias, ensaya exportación/restauración y los recorridos críticos en staging, prepara copia de seguridad y recuperación, y compara resultados. No declares «portable» una función solo por cambiar una variable de entorno. La migración requiere un plan y pruebas propios.

## Comunicación con Dani

Empieza cada sesión con cuatro líneas: **integrado**, **en revisión**, **necesita decisión**, **siguiente paso**. Evita instrucciones de Git si puede tomar la decisión mirando una pantalla, una tarjeta o un diagrama. Tras una corrección de Dani, actualiza la tarjeta y la decisión duradera antes de continuar.
