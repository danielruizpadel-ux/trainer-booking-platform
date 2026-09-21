import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { getPackageDetail } from '@/lib/packages/queries'

/** GET /api/dashboard/packages/[id]   detalle con sus sesiones y reservas enlazadas */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const { id } = await context.params
    const detail = await getPackageDetail(trainer.id, id)
    if (!detail) return NextResponse.json({ success: false, error: 'Paquete no encontrado' }, { status: 404 })
    return NextResponse.json({ success: true, package: detail })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
