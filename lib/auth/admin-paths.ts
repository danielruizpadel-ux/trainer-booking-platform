/** Destino por defecto del área de administración. */
export const ADMIN_HOME = '/admin/dashboard'

/**
 * Solo se vuelve a rutas internas de /admin: nada de redirecciones abiertas
 * (`//otro.dominio`, `/admin.evil`, URLs absolutas…).
 */
export function safeAdminNext(value: string | null): string {
  if (!value) return ADMIN_HOME
  if (value.startsWith('//') || value.includes('\\')) return ADMIN_HOME
  if (value !== '/admin' && !value.startsWith('/admin/') && !value.startsWith('/admin?')) return ADMIN_HOME
  return value
}
