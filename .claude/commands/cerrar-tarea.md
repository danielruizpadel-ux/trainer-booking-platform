---
description: Comprobar una entrega y actualizar tarjeta y documentación sin confundir PR con integración
---

Lee `AGENTS.md`, la tarjeta indicada por Dani ($ARGUMENTS) y los cambios de su rama.

1. Compara resultado y casos de error con los criterios aprobados. Revisa diff, archivos no seguidos, imágenes y secretos; ejecuta comprobaciones relevantes e informa qué no pudiste probar. Indica impacto en pantalla, API, autenticación, datos y hosting; si hay migración, documenta entorno probado, orden, compatibilidad con código anterior, copia de seguridad y recuperación. Separa fallos previos de fallos nuevos.
2. Enseña a Dani la pantalla o recorrido, en móvil si afecta a UI. Indica en palabras sencillas qué funciona y qué sigue pendiente; distingue análisis estático, prueba local y uso real.
3. Pide revisión independiente de Codex si Claude implementó, o de Claude si Codex implementó, cuando el riesgo lo amerite y esté disponible. Registra quién revisó realmente.
4. Comprueba que commit y PR apuntan a la base declarada y que la rama está respaldada en GitHub. Registra el enlace y el SHA. No hagas merge si la revisión o la decisión de producto están pendientes; marca Para revisar.
5. Solo después de integrar y comprobar en la base, marca Hecha, actualiza la decisión duradera en `DECISIONS.md` y el documento dueño, y anota dónde se ve el resultado. Un backup o un PR abierto no cuenta como integrado.
6. Devuelve un cierre de cuatro líneas: **resultado**, **pruebas**, **dónde verlo**, **próximo paso**. No hagas deploy ni migres datos por inferencia.
