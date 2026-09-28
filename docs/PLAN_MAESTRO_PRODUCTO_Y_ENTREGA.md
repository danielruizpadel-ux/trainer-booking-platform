# Plan maestro: reservas para entrenadores y academia

**Fecha:** 28/09/2026 · **Estado:** plan de trabajo, pendiente de validación de decisiones abiertas.  
**Rama general de desarrollo:** `develop`, creada desde `emdash/integracion-programa` en `7e6357e` el 28/09/2026. `main` estaba en `4845640`, 47 commits detrás. El borrador original de este plan fue PR #1; el centro de control se prepara como un PR solo de documentación hacia `main`, y el PR #2 del tablero se propone hacia `develop`; el [PR borrador #3](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/3) muestra la conexión `develop → main` sin incorporarla. Verificar SHA vigentes antes de implementar.

## Tu mapa del proyecto

**Objetivo inmediato:** que Mauri pueda usar la aplicación para cobrar y gestionar clases privadas sin perder reservas, dinero ni información de clientes. Después la adaptamos para la academia y para ofrecerla a otros entrenadores.

```mermaid
flowchart TD
  A["Ahora: ordenar lo que existe"] --> B["Mauri: clase suelta y cobro"]
  B --> C["Mauri: paquetes de 5 y 10"]
  C --> D["Academia: varios entrenadores"]
  D --> E["Producto para otros entrenadores"]
```

| ¿Dónde estamos? | En palabras sencillas |
| --- | --- |
| **Ya existe** | Una base de reservas, cuentas, precios y panel. Hay trabajo avanzado en una rama de integración, aún sin reunir en `main`. |
| **Ahora toca** | Poner a salvo y ordenar ramas, fotos y tareas; comprobar qué funciona; decidir las reglas de cobro y cancelación. |
| **Luego construimos** | Primero el uso real de Mauri; después sus paquetes, la operación de academia y finalmente el producto comercial. |
| **Todavía no está listo** | Abrirlo a clientes reales o dar por hecho que los pagos online y el programa de 10 sesiones funcionan. |

### Cómo trabajaremos contigo

1. **Tú decides cómo debe funcionar el negocio.** Te enseñaré una opción concreta con un ejemplo de cliente; podrás responder en lenguaje normal.
2. **Yo traduzco esa decisión en una tarea pequeña.** Cada tarea tendrá una frase de objetivo, una captura o pantalla si hace falta, y un resultado visible. El detalle técnico queda para el desarrollador.
3. **Se construye y se enseña antes de continuar.** La tarea se revisa y se incorpora a la versión de trabajo; el siguiente paso empieza desde esa versión. Te diré claramente: *hecho*, *en revisión* o *pendiente*.

**Primera hipótesis de piloto:** empezar por Mauri y conservar la posibilidad de añadir un segundo entrenador después. Si Dani necesita dos entrenadores desde el primer día, adelantar el diseño de permisos y titularidad de clientes antes de implementar.

> A partir de aquí está el detalle de negocio y desarrollo para quien ejecute las tareas. Puedes usar solo el mapa anterior para seguir el progreso.

## 1. Norte de producto

Una sola plataforma de reservas con un núcleo compartido: identidad del jugador, entrenador responsable, oferta y precios, disponibilidad, solicitud y confirmación, paquetes/créditos, cancelación, cobros y comunicaciones. Dos usos sobre ese núcleo:

| Carril | Objetivo próximo | Regla de alcance |
| --- | --- | --- |
| Academia / piloto Mauri | Operar clases privadas y paquetes de 5/10 con cuenta de jugador, pista incluida, confirmación manual, efectivo, deuda visible y control desde el panel. | Es la primera experiencia real; comprobar las reglas con reservas reales controladas antes de generalizarlas. |
| Producto para entrenadores | Convertir esas funciones en ajustes seguros por entrenador y, más adelante, en un servicio que se pueda incorporar y vender a otros entrenadores. | Preparar separación de datos y configuraciones sin construir ahora alta autónoma, facturación SaaS ni pagos multicuenta. |

**Academia no equivale a un entrenador.** Si varios entrenadores comparten clientes, pistas, agenda o cuenta de cobro, se necesitará una entidad y permisos de academia definidos. No inferir que basta con asignar cada reserva a Mauri. Decidir titular del cliente, visibilidad entre entrenadores y destinatario del dinero antes de implementar esta capa. En V1, el piloto usa a Mauri; la academia completa se diseña con casos concretos.

El Player Development Plan de 10 sesiones, `/programa`, permanece como prototipo separado; no integrarlo en los paquetes de 5/10 sin una especificación propia.

## 2. Situación comprobada y límites de evidencia

- En la primera comparación de GitHub el 28/09, integración estaba 47 commits por delante de `main` y no había PR abiertos. Después se abrieron PR de plan, tablero y puente `develop → main`; comprobar en GitHub cuáles siguen abiertos. Las ramas `backup/clientes-wip` y `backup/ui-improvement-docs` contienen trabajo aislado; no se ha comprobado el estado de worktrees locales no subidos.
- En integración hay cuenta de jugador, checkout, precios por entrenador, solicitudes de reserva, panel, paquetes internos y migraciones hasta 021. `/programa` usa datos de ejemplo. La sección Clients está en `backup/clientes-wip`, no en integración.
- El PDF `ESTADO_DESARROLLO_Y_PROXIMAS_FASES_2026-09-27.pdf` comunica que 011–021 se aplicaron y que hubo un recorrido local satisfactorio. Tratarlo como resultado informado en ese momento; verificar el esquema vigente y su historial de aplicación antes de nuevas migraciones.
- `ROADMAP.md`, `docs/PLAN_PAQUETES_Y_CALENDARIO.md`, `docs/estado-desarrollo.md`, `README.md` y algunas notas en `CLAUDE.md` conservan frases anteriores a las últimas migraciones. En caso de conflicto, inspeccionar código, commit y base real; registrar la corrección en el documento dueño. No repetir migraciones ni limpieza de datos por el estado de una nota.
- El orquestador V1 existe, pero requiere simultáneamente Claude, Codex, Bothread y un árbol limpio. Un límite de Claude termina la ejecución en FAILED; no hay sustitución automática. Sus registros en `orchestrator/runs/` están ignorados por Git. Puede servir para una tarea acotada cuando estén disponibles ambos, pero no gobierna ramas, roadmap, fotos, decisiones ni merges.

## 3. Contrato funcional ya decidido para el piloto

Mantener las decisiones de producto del PDF, páginas 3–5, como entrada. En síntesis: cuenta obligatoria para contratar/reservar; clases sueltas y packs de 5/10; pista siempre incluida; precios configurables por Mauri y congelados en cada contratación; jugadores y duración fijos dentro del pack; reservas parciales; confirmación tras comprobar la pista; efectivo en la clase suelta y pago completo del pack el primer día; seis meses desde la primera clase impartida; fin automático de clases confirmadas con corrección manual; plazo inicial de cancelación 24 h configurable; cargo pendiente visible y aviso discreto sin bloquear nuevas reservas; acciones auditables para pago, asistencia, devolución de crédito y retirada de cargo.

**No confundir:** estado de reserva, asistencia, crédito del paquete y obligación de pago son dimensiones distintas. Una sesión de paquete no crea un nuevo cargo por el total. Guardar importe, momento, actor y motivo de cada ajuste; `wallet` en esta etapa es saldo e historial de deuda, no dinero custodiado.

**Decisiones todavía abiertas que bloquean código concreto:**
1. Importe de una cancelación tardía de clase suelta y tratamiento de no presentación.
2. Combinaciones permitidas de número de jugadores × duración y su precio; posible diferencia entre Mauri y academia.
3. Qué pasa con vencimiento y créditos cuando se corrige la primera clase marcada impartida.
4. Si cambios del plazo de cancelación rigen solo para reservas nuevas (recomendación: congelar la regla por reserva).
5. En academia: propiedad de cliente, permisos de entrenadores y cobro a una sola cuenta de la academia.

## 4. Entregas ordenadas

| Hito | Resultado demostrable | Prueba de salida |
| --- | --- | --- |
| 0. Inventario y base fiable | Comparar GitHub con worktrees locales; preservar cambios no subidos, fotos y referencias; revisar `backup/clientes-wip`; comprobar migraciones vigentes y riesgos de despliegue. Abrir tareas con dueño y dependencia. | Tabla de ramas/commits/rutas de assets, estado de BD verificado, cero trabajo sin respaldo identificado. |
| 1. Diseño de contratos | Diagramar reserva suelta y pack, relación jugador-entrenador-academia, estados, pagos y créditos. Cerrar las decisiones que afectan al esquema. | Criterios de aceptación y transiciones documentados, ejemplos de cancelación temprana/tardía y corrección. |
| 2. Piloto de reserva suelta | Cuenta exigida en UI y API; ficha Clients mínima y aislada; solicitud, confirmación de pista, pago en efectivo, cancelación y deuda trazable. | Dos usuarios y entrenadores de prueba; reservas repetidas, dos solicitudes concurrentes, acceso cruzado denegado, importes históricos estables. |
| 3. Packs 5/10 | Compra/contratación desde cuenta, créditos reservados sin doble uso, agenda parcial, validez, asistencia, cobro único y correcciones. | Reservar algunas fechas y luego otras; falta de pista libera crédito; cancelar dentro/fuera; vencer; reintentar sin duplicar. |
| 4. Comunicación y acabado | Emails de solicitud/confirmación/cambio/cancelación, WhatsApp manual, inglés, móvil, precios y botones reales. | Mensajes describen el estado verdadero; no se promete pista hasta confirmación; prueba en móvil. |
| 5. Academia operativa | Definir entidad academia, varios entrenadores y permisos, asignación de reservas y cobro a cuenta única si el piloto lo exige. | Casos reales de un jugador con dos entrenadores y roles separados; pruebas de aislamiento. |
| 6. SaaS entrenadores | Alta, configuración, soporte, planes y modelo comercial, cobros por entrenador según país/proveedor. | Piloto externo y métricas de uso antes de implementar facturación y onboarding autoservicio. |

Los hitos 2–4 pueden incluir campos configurables por entrenador, con valores iniciales para Mauri. No construir un editor libre de estados, saldos o permisos. El hito 5 puede adelantarse en alcance reducido si la academia lo necesita antes que los packs; registrar el cambio de dependencia.

**Puerta de publicación:** usar `docs/ANTES_DE_PUBLICAR.md`, resolver bloqueantes vigentes, pasar build/type-check y pruebas relevantes, comprobar esquema y entorno publicado, revisar experiencia con Mauri. No asumir que un merge en `main` despliega ni que está desconectado de hosting: verificar automatizaciones primero.

## 5. Forma de trabajar desde hoy

### Fuente de verdad y tareas

- `main` es la versión aceptada; `develop` es la base general de desarrollo explícita, sin llamarla producción. Nació en el mismo commit de la anterior rama de integración; `emdash/integracion-programa` queda como referencia histórica hasta decidir su retirada. Cada tarea enlaza **rama base + SHA**, dueño, archivos o zona, dependencia, decisiones abiertas, criterios de aceptación, pruebas y estado: `planned → in progress → review → integrated`.
- Una tarea = una rama/worktree desde la base vigente. Antes de empezar: `git status --short --branch`, `git log -1 --oneline`, `git worktree list`, `git branch -vv`, `git fetch` cuando haya conexión. No crear otro worktree hasta inventariar los existentes. No reusar una rama compartida en dos worktrees ni trabajar el mismo archivo a la vez sin coordinación.
- Integrar en orden de dependencias con PR corto hacia la rama base declarada. Revisar `git diff`, pruebas y cambios de base; actualizar/rebasar de forma segura cuando cambie la base; resolver conflictos en la rama de la tarea. Después del merge, actualizar tareas y documentos dueño. No borrar ramas o worktrees que contengan cambios sin integrar o archivos sin respaldo.
- Documentar decisiones duraderas en `DECISIONS.md`; ordenar hitos en `ROADMAP.md`; estado de integración en `docs/estado-integracion.md`. Este documento une estrategia y procedimiento, no reemplaza documentación de BD, reservas o seguridad. No marcar una tarea como hecha porque una IA lo dijo.
- Durante el límite de Claude, **Codex implementa una tarea delimitada y revisa diff y pruebas**; para cambios de mayor riesgo, realizar revisión separada antes del merge. Cuando vuelva Claude: Claude puede implementar; Codex revisa independientemente. El orquestador V1 solo se usa donde sus requisitos se cumplen, sin presentarlo como control de todo el proyecto.

### Fotos y otros archivos

- Diferenciar **asset del producto** de referencia de diseño. Si la app debe renderizar una foto, debe estar en una ruta versionada del repositorio y referenciada desde el código (ejemplo actual `public/trainers/mauri/hero.jpg`), con permiso de uso y tamaño razonable. Añadirla a la misma rama/PR que su UI; comprobar que aparece en `git status`, `git ls-files` y en GitHub después del push. Si está ignorada, fuera de Git, solo en un chat o solo en un worktree, el siguiente worktree no la tendrá.
- Referencias visuales no publicadas: guardar original y enlace estable fuera del repo o en un área de referencias acordada; registrar en la tarea ubicación, fecha, autorización y qué se debe reproducir. Evitar subir fotos personales de clientes o credenciales al repositorio.
- Antes de cerrar una rama con cambios visuales, comprobar render de las imágenes en la rama integrada y en móvil; no trasladar imágenes copiando una carpeta local sin comprobar su seguimiento en Git.

### Plantilla mínima de tarea

```text
Objetivo:
Carril e hito:
Base: rama @ SHA
Dueño/agente:
Archivos o área reservados:
Dependencias y decisiones abiertas:
Comportamiento esperado (jugador / entrenador / admin):
Datos, permisos y casos de error:
Assets y referencia:
Pruebas y captura de evidencia:
PR/commit de integración:
```

## 6. Programa visual y protocolo de desarrollo

**Propósito:** Dani controla prioridades, reglas de negocio y diseño sin tener que leer Git. Los agentes ejecutan tareas delimitadas y dejan una prueba visible. El tablero vive en archivos del proyecto y se respalda en GitHub. Nimbalyst es el candidato a interfaz visual; la prueba inicial debe demostrar que tareas, imágenes y decisiones se conservan al abrir el proyecto en otra copia. Emdash puede seguir disponible hasta decidir el cambio.

### Una sola vista de control

Mantener un tablero con seis estados: **Idea → Por decidir → Lista → En desarrollo → Para revisar → Hecha**. Tres líneas de producto: **Mauri**, **Academia**, **Entrenadores**. Cada tarjeta muestra un título en lenguaje normal, el resultado visible, prioridad, responsable, estado y enlace a las capturas y al cambio integrado. Limitar el trabajo simultáneo: una tarea que afecte reservas o base de datos cada vez; tareas visuales independientes solo si no comparten archivos.

Guardar tarjetas importantes como Markdown versionado en el repositorio. Confirmar en la prueba de Nimbalyst si el tipo elegido es un archivo rastreado por Git: sus elementos nativos de base local no quedan respaldados solo por verse en el tablero. Las imágenes insertadas en documentos deben estar versionadas junto al documento o enlazadas a un lugar estable, con revisión de privacidad.

### Aprendizajes de la prueba de Nimbalyst (28/09/2026)

- Dani abrió el worktree existente `integracion-programa` (`emdash/integracion-programa`) y el agente pudo leer este PR y los documentos locales. No se ha probado aún la sincronización del tablero entre copias.
- Se creó el tipo de tarjeta y los seis estados anteriores; su configuración quedó sin seguimiento en `.nimbalyst/trackers/tarjeta.yaml`. La tarjeta de ensayo «Probar protocolo de trabajo» quedó en la base local de Nimbalyst, estado Idea: **verla en el tablero no equivale a respaldarla en GitHub**.
- Segundo ensayo: se creó una tarjeta Markdown junto a `.nimbalyst/trackers/tarjeta.yaml` (columnas) y `tarjetas.md` (tarjeta). El tablero reconoce título, estado, prioridad, responsable, fechas y descripción, **pero deja vacíos los campos propios** (línea de producto, hito y resultado) y, en esta prueba, tampoco presenta las etiquetas. La información sigue escrita en el Markdown; no confundir conservación del dato con visibilidad en el tablero. No se ha verificado aún su recuperación desde otro ordenador ni un respaldo en GitHub. Anotar la ubicación exacta y comprobar que ambos archivos están incluidos en un mismo PR; solo después eliminar la tarjeta local INP.1 para evitar duplicados.
- Criterio de adopción visual: poder reconocer línea de producto, hito y resultado de cada tarea sin abrir todas las tarjetas. Mientras el gestor no presente los campos propios, probar prefijos breves en el título (por ejemplo, `[Mauri · H2] Cobrar clase suelta`) y poner el resultado en la primera línea de la descripción. Evaluar con tres tarjetas reales de carriles distintos; si no se entiende de un vistazo, revisar otra vista o herramienta antes de trasladar todo el backlog.
- En `tarjetas.md` se cambió **la misma tarjeta** (ID `tar_01M3KB7Y8AYB5X5TPVS7V9G73E`) a `[Proceso · H0] Probar protocolo de trabajo` y primera línea `Resultado: tablero y tarjeta recuperables desde GitHub.`. El agente constató que el índice seguía mostrando temporalmente el título anterior, y observó que las etiquetas de una edición previa aparecieron minutos más tarde. **Verificación visual de Dani (14:38)**: en lista y en kanban, INP.2 todavía muestra `Probar protocolo de trabajo`, igual que INP.1; la tarjeta no presenta la línea de resultado. En la siguiente captura, INP.2 **sí muestra** `[Proceso · H0] Probar protocolo de trabajo`: los corchetes no impiden su lectura; la hipótesis anterior queda descartada. El agente cambió luego el archivo a `Proceso · H0 — Probar protocolo de trabajo`, pero informó que la vista todavía conservaba la versión anterior. La descripción «Resultado: ...» aparece en el detalle según su observación, no está comprobado que se vea en la tarjeta de columnas. Su explicación de que el índice interno se actualiza al guardar desde Nimbalyst o después de procesar sus ediciones es una inferencia basada en comportamiento y lectura del código de la app, no una garantía del producto. Conservar como regla práctica: verificar en la vista tras guardar, y no dar por perdido un cambio solo por retraso del índice. La captura kanban tenía desplazamiento horizontal, así que no permite concluir aún cuántas columnas existen. No confundir la vista simulada del agente con una captura real. Conservar INP.1 hasta verificar el Markdown versionado en otra copia.
- Respaldo en GitHub verificado: [PR #2](https://github.com/danielruizpadel-ux/trainer-booking-platform/pull/2), abierto originalmente hacia integración y ahora redirigido a `develop` desde `docs/piloto-nimbalyst` (`4ba0671`). Contiene exactamente `.nimbalyst/trackers/tarjeta.yaml` y `nimbalyst-local/tracker/tarjetas.md` (ID `tar_01M3KB7Y8AYB5X5TPVS7V9G73E`, título `Proceso · H0 — Probar protocolo de trabajo`). El archivo YAML fija seis estados; el Markdown incluye resultado y pasos de la prueba. **Verificado:** GitHub almacena ambos archivos. **Verificado en clon independiente** (`/Users/dani/nimbalyst-prueba/trainer-booking-platform`, captura 14:50): Nimbalyst reconoce el tipo Tarjetas y muestra una sola tarjeta INP.2, `Proceso · H0 — Probar protocolo de trabajo`, estado Idea. INP.1 no reaparece. La captura siguiente sí muestra kanban con una sola tarjeta INP.2 en Idea; como está seleccionado `All` y el tablero se desplaza horizontalmente, se ven columnas genéricas `In Progress` e `In Review`, y **todavía no se ha confirmado visualmente que los seis estados propios aparezcan al filtrar por Tarjetas**. Al seleccionar Tarjetas en el clon, la vista de lista muestra además las etiquetas `proceso` y `h0`: sí son visibles tras la indexación, corrigiendo la primera observación de que estaban vacías. Una captura posterior es de tabla, así que no verifica las seis columnas específicas. Imágenes, decisiones y recorrido de una tarea real siguen pendientes. El enlace dentro de `tarjetas.md` al plan maestro funcionará cuando la rama de desarrollo haya incorporado los documentos compartidos desde `main`. El worktree abierto en Nimbalyst cambió a `docs/piloto-nimbalyst`; para nuevas tareas de producto hay que partir de la base `develop`, no de esta rama de ensayo.
- El trabajo local de `emdash-ui-improvement-3uwvl` se respaldó en `backup/ui-improvement-local-2026-09-28` (commit `a29e53e`, 24 archivos). Respaldada **no** significa integrada en el producto. Los ocho commits de `main` local adelantados respecto a `origin/main` ya aparecen en la historia de la rama remota de integración; todavía no están en `origin/main`. No borrar las copias de trabajo por esta observación.

### Primer ensayo de investigación para validar el protocolo (lectura de código, 28/09)

**Este ensayo comprueba que podemos investigar, dibujar y registrar diferencias entre el código y una decisión de producto. No abre una tarea de implementación ni exige decidir ahora cómo cobrar cancelaciones. La prioridad de esta sesión sigue siendo montar el sistema de trabajo visual y su protocolo.**

**Pregunta de ejemplo:** ¿qué ocurre desde que un jugador elige hora hasta que Mauri consigue pista, y qué falta para que sea el piloto de cobro en efectivo? **Alcance de evidencia:** lectura de la rama `emdash/integracion-programa` en GitHub; no se ejecutó el navegador ni se creó una reserva de prueba.

```mermaid
flowchart TD
  A["Jugador elige hora y duración"] --> B["Checkout: cuenta o invitado"]
  B --> C["Servidor valida precio y hueco"]
  C --> D["Solicitud pendiente de confirmar"]
  D --> E{"Mauri consigue pista"}
  E -->|Sí| F["Clase confirmada"]
  E -->|No| G["Reprogramar; hueco liberado"]
```

| Observación comprobada en el código | Qué significa para Dani |
| --- | --- |
| `components/mauri/BookingSection.tsx` consulta `/api/player/me`, pero permite continuar como anónimo; `BookingCheckout.tsx` contiene formulario de invitado. | La regla **cuenta obligatoria** ya acordada para el piloto todavía no se cumple en esta rama. Hay que concretar la excepción ante caída del login y actualizar interfaz **y** API en una tarea. |
| `app/api/reservations/route.ts` calcula el precio en servidor, busca ventanas libres y usa `create_booking_request` con clave de idempotencia; si otra petición gana la franja devuelve 409. | La solicitud se registra como pendiente; no promete pista antes de que Mauri confirme. Conservar estas protecciones al modificar el checkout. |
| `app/api/dashboard/reservations/[id]/route.ts` restringe decisiones al entrenador dueño; `lib/reservations/confirmation.ts` confirma o pasa a `needs_reschedule` y libera la franja cuando no hay pista. La notificación al cliente invoca un stub. | Enseñar dos caminos de Mauri y revisar el texto que ve el jugador. No decir que se envía un email real por el mero hecho de cambiar de estado. |
| La documentación `docs/BOOKING_FLOW.md` describe el POST anterior con inserción directa y actualización de `current_bookings`; el código actual usa RPC. | Corregir ese documento dueño después de contrastar el recorrido en un entorno de prueba. |

**Ejemplo de tarjeta para una futura sesión de producto (no crearla ahora):** «Mauri · H1 — Cuenta obligatoria y cancelación de clase suelta». Resultado visible: jugador inicia sesión y solicita una hora; Mauri confirma la pista o propone reprogramar; ambos ven un estado comprensible. Separar la implementación del cobro y de la cancelación en tareas pequeñas después de cerrar las reglas. Casos de aceptación: visitante sin sesión; sesión caducada; perfil incompleto; fallo de autenticación; dos jugadores intentando la misma hora; Mauri sin pista. Una sesión caducada no debe hacerse pasar por reserva confirmada.

**Ejemplo de decisión de negocio para más adelante, fuera del ensayo del protocolo:** si se cancela con menos de 24 horas o el jugador no aparece, cuánto se debe cargar en RM. Ejemplo para discutir: clase confirmada de RM300 cancelada 4 horas antes. Mostrar a Dani opciones concretas (importe completo, porcentaje o importe fijo), qué ve el jugador y cómo queda el cargo pendiente; registrar la elección antes de modificar base de datos o UI. La inspección anterior no verificó todavía un registro de cobros en efectivo ni su efecto en saldo: abrir una tarjeta de análisis específica, sin inferir que ya existe.

### Investigar una función propia o de la competencia

1. **Plantear la pregunta:** qué problema real del jugador, entrenador o administrador resolvería y qué decisión queremos tomar. Abrir tarjeta Idea con hipótesis y resultado esperado; distinguir necesidades expresadas por Mauri de suposiciones nuestras.
2. **Mirar el producto actual:** reproducir el recorrido relevante en nuestra web y leer código, reglas, pantallas y datos del repositorio. Guardar una captura o flujo breve con fecha y versión; anotar lo que realmente funciona frente a lo que solo aparece en un prototipo.
3. **Examinar competidores concretos:** probar el recorrido público o la demo accesible, capturar enlaces, fecha, país y plan/precio si afecta a la decisión. Comparar el mismo caso de uso (por ejemplo, reservar, cancelar o comprar un paquete), desde móvil y con roles distintos si es posible. Marcar explícitamente lo no comprobado o lo que requiere cuenta/pago. No copiar textos, diseños ni datos personales.
4. **Sintetizar en una sola ficha:** tabla corta «nuestro producto / alternativa A / alternativa B», con pasos, fricción, ventaja, evidencia y grado de certeza. Recomendar **adoptar, adaptar, posponer o descartar**, explicar coste y dependencia, y estimar impacto en cobro, permisos, agenda y soporte.
5. **Decisión de Dani:** mostrar dos o tres opciones con ejemplo de un cliente real; registrar elección, motivo y fecha en `DECISIONS.md` si cambia la dirección del producto. Convertir la elección en una tarjeta Lista con criterio de aceptación visible. Si la investigación no cambia ninguna decisión, archivarla y seguir.

**Ficha de investigación mínima:** pregunta, usuario, situación actual, URLs/capturas y fecha, comparación del mismo flujo, observaciones/no verificado, propuesta, decisión, enlace a tarea. Revisar precios, productos y normativas vigentes en sus fuentes antes de actuar: pueden cambiar.

### Una función, siete pasos

| Paso | Quién | Qué queda visible para Dani | Puerta para avanzar |
| --- | --- | --- | --- |
| 1. Idea | Dani + ChatGPT | Qué problema resuelve y para quién; ejemplo real. | Dani confirma el resultado deseado. |
| 2. Decisión | ChatGPT | Opciones de negocio, recomendación, regla elegida y asuntos abiertos. | Reglas que cambian datos/dinero cerradas. |
| 3. Diseño | Agente de análisis, sin editar producto | Recorrido del cliente y entrenador, boceto o diagrama pequeño, criterios de aceptación. | Dani entiende y valida el recorrido. |
| 4. Tarea | ChatGPT / coordinador | Tarjeta lista con base y dependencia; un agente nombrado para implementar y otro para revisar cuando proceda. | Worktree correcto y archivos de referencia respaldados. |
| 5. Construcción | Codex mientras Claude esté limitado; Claude o Codex después según tarea | Pantalla o comportamiento funcionando, enlace al cambio, pruebas resumidas. | Diff acotado y sin archivos ajenos. |
| 6. Revisión | Agente distinto si el riesgo lo amerita + Dani para experiencia | Captura o demo, escenarios de error, resultado de pruebas y pendientes. | Correcciones hechas y revisión aceptada. |
| 7. Integración | Responsable de integración | Tarjeta Hecha con PR/commit y versión de trabajo donde se puede ver. | Cambio incorporado a la rama base y documentación de decisión actualizada. |

**Definición de Hecha:** no basta con que el agente termine ni con que exista una rama. Tiene que estar integrado en la rama base declarada, tener pruebas apropiadas y una evidencia visual/funcional que Dani pueda evaluar. Una migración escrita no significa aplicada; una pantalla demo no significa venta o cobro real.

### Plantillas breves para agentes

**Analizar (sin código):** “Lee la tarjeta y la documentación relevante. Comprueba código y rama. Resume qué existe, dibuja solo el flujo necesario, plantea decisiones de negocio y criterios de aceptación. No edites código ni datos.”

**Construir (agente nombrado):** “Implementa solo la tarjeta aprobada desde la rama base indicada. Respeta CLAUDE.md y reglas existentes. Verifica casos normales y errores, revisa diff y assets. Entrega pantalla o demostración, pruebas, commit/PR y pendientes. No hagas deploy ni migraciones reales por inferencia.”

**Revisar (otro agente cuando haga falta):** “Revisa el diff contra la tarjeta y la rama base. Busca errores en permisos, reservas simultáneas, créditos y cobros según el área. Indica gravedad, pasos reproducibles y qué comprobaste; no marques Hecha por una descripción del implementador.”

Estos textos son tipos de encargo; la tarjeta añade su contexto específico. Si solo hay un agente disponible, hacer revisión separada después de la implementación y registrar que no fue independiente. El orquestador V1 es opcional y sus requisitos no bloquean este protocolo.

### Cómo modificar una función ya hecha

1. Abrir la tarjeta original y reproducir el comportamiento actual; registrar qué falla o qué cambia en el negocio. Si hay usuarios reales, comprobar si existen datos o contratos afectados.
2. Describir el nuevo comportamiento con un ejemplo «antes → después», incluidos permisos, cobros, reservas y mensajes. Dani valida pantallas y reglas que afectan al cliente.
3. Comprobar qué otras tareas dependen de esa función. Elegir una rama nueva desde la base vigente; no editar directamente una rama antigua de respaldo.
4. Implementar el cambio pequeño, mantener compatibilidad o planear migración de datos cuando proceda; probar el recorrido anterior y el nuevo. Mostrar demo en móvil cuando afecte a la interfaz.
5. Revisión del diff y de casos de error, integración, actualización de decisión y tarjeta; registrar dónde se puede probar y cómo volver atrás si el cambio causase problemas.

**Cadencia de control:** al empezar cada sesión, mostrar a Dani en una vista «qué está integrado, qué está en revisión, qué necesita decisión y qué sigue». Al cerrar una tarea, anotar evidencia, commit/PR, riesgos y próximo paso; después de uso real, registrar comentarios de Mauri o clientes como nuevas tarjetas, no como modificaciones silenciosas. No abrir más tareas por costumbre: priorizar por valor y bloqueo.

### Reglas para cambios de opinión, ramas y fotos

- **Cambiar el plan:** mover o editar la tarjeta antes de tocar código. Si ya está en desarrollo, registrar qué parte se descarta y si se termina o se cancela; el agente no decide una nueva oferta comercial por su cuenta.
- **Una base declarada:** mientras `main` siga atrasada, tareas nuevas desde `develop` verificada; cada worktree conoce su tarjeta y rama base. Antes de abrir otro, inventariar los abiertos y sus cambios. No mezclar dos tareas que cambian la misma zona sin integrarlas en orden.
- **Respaldo:** commit y push de cada entrega a su rama, con PR hacia la base. Antes de cerrar o borrar un worktree, comprobar si quedan archivos sin seguimiento, fotografías o documentos. Un backup `backup/*` salva el material, pero no significa que la función esté integrada.
- **Imágenes:** referencia de diseño y asset de la app se identifican por nombre y destino. Si un documento de Nimbalyst pega una imagen en `.nimbalyst/assets`, comprobar que Git la incluye junto al documento. No publicar fotos de clientes ni subir `.env.local`.
- **Versiones:** una sola tarjeta dice dónde probar la función. Cada cierre señala qué está en GitHub, qué permanece solo en Mac y qué cambia en Supabase. Publicar requiere la checklist específica, no ocurre automáticamente por marcar Hecha.

### Prueba de adopción de Nimbalyst

1. Abrir el worktree de integración existente sin mover ni limpiar ramas.
2. Convertir la tarjeta de prueba local a Markdown versionado sin duplicarla en el tablero; confirmar el YAML del tipo y el archivo de tarjeta. Después probar un cambio textual inocuo, adjuntar una imagen de referencia no sensible y un flujo pequeño de reserva.
3. Ejecutar una tarea en worktree separado, revisar el diff y registrar una decisión o corrección de Dani.
4. Comprobar en GitHub que tarjeta/documento, imagen y cambios están en una rama revisable; comprobar en otra copia que se abren. Si no se conservan, corregir el modo de almacenamiento antes de migrar el tablero real.
5. Cerrar el ensayo con un resultado claro: adoptar Nimbalyst o continuar con Emdash, sin borrar el otro entorno durante la transición.

## 7. Próximas acciones inmediatas

1. Inventariar en el ordenador los worktrees locales, sus archivos no seguidos y fotos antes de tocar merges o hacer limpieza; contrastar contra ramas remotas `backup/*` y `emdash/*`.
2. Traer `backup/clientes-wip` a una revisión aislada y cerrar la ficha mínima de cliente; abrir tarea del hito 0 con pruebas de aislamiento.
3. Acordar la tarifa por combinación y las tres reglas de penalización/asistencia/caducidad del apartado 3; redactar casos de aceptación antes de tocar DB.
4. Elegir si el primer piloto operativo es solo Mauri o ya requiere dos entrenadores de academia. Eso decide cuándo entra el hito 5.
5. Actualizar los documentos heredados que afirman que una migración o función todavía no existe, solo tras contrastarlo con código y base actual. Después decidir la integración hacia `main` con la checklist de publicación, sin merges masivos a ciegas.
