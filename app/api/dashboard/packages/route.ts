import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { listTrainerPackages } from '@/lib/packages/queries'

/**
 * GET  /api/dashboard/packages          paquetes del entrenador de la sesión
 * POST /api/dashboard/packages          venta suspendida hasta separar el precio
 *                                       del descuento multihora y registrar el cobro
 */
export async function GET() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const packages = await listTrainerPackages(trainer.id)
    return NextResponse.json({ success: true, packages })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}

export async function POST() {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    return NextResponse.json(
      { success: false, error: 'La venta de paquetes todavía no está disponible. Los paquetes existentes se pueden consultar y gestionar.' },
      { status: 503 }
    )
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
