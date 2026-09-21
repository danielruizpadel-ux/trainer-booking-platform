import { NextResponse } from 'next/server'
import { requireTrainer } from '@/lib/auth/current-trainer'
import { listTrainerPackages } from '@/lib/packages/queries'
import { createClientPackage, type CreatePackageInput } from '@/lib/packages/create'

/**
 * GET  /api/dashboard/packages          paquetes del entrenador de la sesión
 * POST /api/dashboard/packages          { client_name, client_email, client_phone?, notes?, sessions_total: 5 | 10 }
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

export async function POST(request: Request) {
  try {
    const trainer = await requireTrainer()
    if (trainer instanceof Response) return trainer
    const body = (await request.json().catch(() => null)) as CreatePackageInput | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }
    const result = await createClientPackage(trainer.id, body)
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true, id: result.id })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
