# Recorrido local de la reserva de Mauri

- **Objetivo:** mostrar lo que ve un jugador antes de enviar una solicitud de reserva.
- **Pantalla y versión:** `/mauri`, servidor local de la copia `develop` en `195267cbbdee079c5e00829e31bcc43e0bff0bb9`, 29/09/2026. Las capturas se tomaron con viewport de escritorio (1440 × 900) y móvil (390 × 844).
- **Comprobado:** se eligió una sesión de 1 hora el viernes 2 de octubre a las 09:00 y se llegó a «Review your booking» en ambos tamaños. La pantalla ofrece «Continue with my account» o un formulario sin cuenta con nombre, email y teléfono. Los campos estaban vacíos; no se pulsó «Confirm booking», no se envió una reserva y no hubo cobro.
- **Capturas:** [revisión en escritorio](escritorio-revision.png) y [formulario sin cuenta en móvil](movil-sin-cuenta.png). Revisadas visualmente: no muestran datos de clientes, claves, correo privado ni administración. Son copias idénticas de los originales conservados en `.nimbalyst/transcript-images/` de la carpeta local.
- **Fricción observada:** en móvil, la selección de hora y su resumen están separados verticalmente; la selección está en español y la revisión en inglés.
- **Decisión de Dani:** conservar y versionar estas dos capturas, enlazarlas desde la misma tarjeta y abrir un PR hacia `develop`. No se ha decidido cambiar el requisito de cuenta ni otras reglas comerciales.
- **Límites:** se detuvo antes del envío; no se comprobó la confirmación posterior, la reserva real ni el flujo con una cuenta iniciada. La comparación visual con otros servicios sigue pendiente.
