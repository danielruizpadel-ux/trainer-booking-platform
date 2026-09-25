import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { isProgramDemoEnabled } from './demo'

/**
 * Primera línea de cada página y del layout de /programa: 404 si el
 * prototipo no está activado (ver lib/programs/demo.ts).
 *
 * `connection()` hace que la comprobación se evalúe en cada petición y no
 * quede congelada en el build: activar o desactivar PROGRAMA_DEMO en el
 * servidor no obliga a recompilar.
 */
export async function requireProgramDemo(): Promise<void> {
  await connection()
  if (!isProgramDemoEnabled()) notFound()
}
