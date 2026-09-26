/**
 * ¿Hay evidencia fiable de que una escritura YA ENVIADA se rechazó (y su
 * transacción se deshizo)?
 *
 * supabase-js devuelve como `error` lo que venga en el cuerpo de la
 * respuesta: `code`, `message`, `details`. Un proxy o una pasarela (502/504
 * con un JSON propio) puede traer un `code` con formato válido — cinco
 * caracteres o `PGRSTxxx` — sin que la petición haya llegado a Postgres, o
 * mientras la transacción sigue en marcha. El formato del código no prueba
 * nada (revisión de Codex): antes se deducía "rollback" de él.
 *
 * Ahora solo cuenta como rechazo confirmado un error que lleve un
 * identificador que únicamente generan NUESTRAS funciones y restricciones
 * (p. ej. 'window_plan_stale', 'one_off_window_conflict',
 * 'reservations_no_overlap', o "no existe la función <la nuestra>"), junto
 * con su código. Cualquier otro error después de enviar la escritura es
 * «resultado no confirmado»: se dice así y se recarga, sin afirmar que no
 * cambió nada.
 *
 * Un error ANTES de enviar la escritura (una lectura previa) no necesita
 * esto: no se escribió nada.
 */
export interface RejectionEvidence {
  /** Código que debe traer el error (el que produce nuestra función/restricción). */
  code: string
  /** Texto que solo produce nuestra función/restricción (en message o details). */
  marker: string
}

export function isConfirmedRejection(
  error: { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
  evidence: RejectionEvidence[]
): boolean {
  if (!error || typeof error.code !== 'string') return false
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  return evidence.some((e) => e.code === error.code && text.includes(e.marker))
}
