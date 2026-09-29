import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/supabase/server'
import { finishPlayerEntry } from '@/lib/auth/player-entry'
import { allowsImplicitTrainerLink, isDraftId, isValidTrainerSlug } from '@/lib/players/entry'

/**
 * GET /cuenta/auth/vincular?trainer=<slug>
 *
 * Para quien YA tiene sesión y abre /cuenta/entrar?trainer=<slug> (p. ej. el
 * enlace de la página pública del entrenador): proxy.ts le manda aquí en
 * vez de a /cuenta, para no perder el entrenador. Crea la relación con el
 * mismo paso que el callback del login (finishPlayerEntry).
 *
 * Solo vincula si la petición viene de nuestra web o se abrió directamente
 * (allowsImplicitTrainerLink): un enlace desde otra web no puede vincular a
 * un jugador con sesión a un entrenador (CSRF). En ese caso entra igual,
 * sin vínculo.
 *
 * Está bajo /cuenta/auth (pública para el proxy) y comprueba la sesión ella
 * misma: sin sesión, vuelve a /cuenta/entrar conservando el entrenador.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const trainerParam = searchParams.get('trainer')
  const trainerSlug = isValidTrainerSlug(trainerParam) ? trainerParam : null
  const draftParam = searchParams.get('draft')
  const draftId = isDraftId(draftParam) ? draftParam : null

  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const loginUrl = new URL('/cuenta/entrar', origin)
    if (trainerSlug) loginUrl.searchParams.set('trainer', trainerSlug)
    if (trainerSlug && draftId) loginUrl.searchParams.set('draft', draftId)
    return NextResponse.redirect(loginUrl)
  }

  const linkTrainer = allowsImplicitTrainerLink(request.headers)
  if (trainerSlug && !linkTrainer) {
    console.warn(`Vínculo con "${trainerSlug}" ignorado: petición desde otro origen`)
  }

  const destination = await finishPlayerEntry(user, { trainerSlug, draftId, linkTrainer })
  return NextResponse.redirect(`${origin}${destination}`)
}
