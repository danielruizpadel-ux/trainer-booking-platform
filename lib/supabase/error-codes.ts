/**
 * ¿Respondió la base? Un SQLSTATE (5 caracteres) o un PGRSTxxx de PostgREST
 * significan que la petición llegó y se rechazó: la transacción se deshizo.
 * Un error sin código (supabase-js con la red cortada, un 5xx de un proxy)
 * después de mandar una escritura NO dice si se aplicó.
 */
export function isDatabaseErrorCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code) || /^PGRST\d+$/.test(code))
}
