import { redirect } from 'next/navigation'
import { requireAdminPage } from '@/lib/auth/current-admin'
import { ADMIN_HOME } from '@/lib/auth/admin-paths'

/** /admin → el panel, solo si hay permiso (si no, login o 404). */
export default async function AdminIndexPage() {
  await requireAdminPage('/admin')
  redirect(ADMIN_HOME)
}
