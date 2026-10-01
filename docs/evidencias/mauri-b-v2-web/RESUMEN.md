# Mauri · implementación web de la propuesta B v2 (issue #31, PR #35)

## Estado inicial (01/10/2026, antes de editar)

- **Mock aprobado por Dani:** `nimbalyst-local/mockups/mauri-opcion-b-pista.mockup.html` en la rama `design/mauri-propuestas-hifi-20261001`, commit `f1d93f385859a41ac244ed6c7daa4e8a32bd0d1e`, SHA-256 del archivo `b71098e620b1034ec95e69cd75e25796ee2860fed553434180b2c6910094ddf0`. Es solo referencia: no se modifica.
- **PR #35:** abierto hacia `develop`; head remoto `feature/mauri-editorial-pr1-20260929` = `f84b5bfdc1e78db4595540d54d8d57156c9234b7`.
- **Worktree de esta tarea:** `trainer-booking-platform-develop-clean_worktrees/mauri-b-v2-web-20261001`, rama local `feature/mauri-b-v2-web-20261001` creada en `f84b5bf`; se sube al mismo PR con `git push origin HEAD:feature/mauri-editorial-pr1-20260929`. El worktree original del PR (`mauri-editorial-pr1-20260929`, limpio) y `develop` (con cambios locales ajenos) no se tocan.
- **Servidor local:** `npx next dev -p 3012` en este worktree (el 3001 lo usa otra copia). `.env.local` es un enlace al de la copia principal, ignorado por Git.
- **Capturas «antes»** (`antes-*.png`, [métricas](metricas-antes.json)): en escritorio el resumen termina 23 px por debajo del calendario con 1 hora y 102 px con 3 horas (defecto señalado por Dani). Solo lecturas `GET` contra la base; el único error de consola es el 404 de `favicon.ico`, previo.
