import { NextResponse, type NextRequest } from 'next/server'
import { respondToProposal } from '@/lib/reservations/proposal'

/**
 * POST /api/propuesta/[token]   body: { action: 'accept' | 'decline' }
 * Público (sin login): el token es la autorización. Un solo uso.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params
    const body = (await request.json().catch(() => null)) as { action?: unknown } | null
    const action = body?.action
    if (action !== 'accept' && action !== 'decline') {
      return NextResponse.json({ success: false, error: "action debe ser 'accept' o 'decline'" }, { status: 400 })
    }
    const result = await respondToProposal(token, action === 'accept')
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    }
    return NextResponse.json({ success: true, accepted: result.accepted, trainerSlug: result.trainerSlug })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
