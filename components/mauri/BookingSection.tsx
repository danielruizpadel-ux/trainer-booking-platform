'use client'

import { useEffect, useState } from 'react'
import BookingFlow from '@/components/booking/BookingFlow'
import type { BookingAccount, BookingPlayer } from '@/lib/players/booking-contact'
import { browserDraftStorage, takeDraft, type BookingDraft } from '@/lib/booking/draft'
import { isDraftId } from '@/lib/players/entry'

interface BookingSectionProps {
  trainerId: string
  trainerName: string
  /** Slug público; con él se enlaza a la cuenta de jugador (/cuenta/entrar?trainer=) */
  trainerSlug?: string
  trainerImageUrl?: string | null
  /** Duraciones de clase que ofrece el entrenador (60/90) */
  classDurations?: number[]
  trainerPrice?: number
  trainerEmail?: string
  trainerPhone?: string
}

type AccountState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  /** Con sesión; `player` null = sin perfil de jugador completo */
  | { status: 'authenticated'; player: BookingPlayer | null }
  /** No se pudo comprobar (Supabase caído): se dice, y se puede reservar sin cuenta */
  | { status: 'error' }

export default function BookingSection({
  trainerId,
  trainerName,
  trainerSlug,
  trainerImageUrl = null,
  classDurations = [60],
}: BookingSectionProps) {
  // Cuenta de jugador: con sesión y perfil completo, la reserva usa esos
  // datos y no pide el formulario; con sesión y perfil incompleto, primero se
  // completa el perfil. Si la comprobación falla, se avisa y se puede
  // reservar sin cuenta (como invitado).
  const [account, setAccount] = useState<AccountState>({ status: 'loading' })
  const [restoredDraft, setRestoredDraft] = useState<BookingDraft | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/player/me', { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok || !data) throw new Error('me')
        return data
      })
      .then((data) => {
        if (cancelled) return
        setAccount(data.authenticated ? { status: 'authenticated', player: data.player ?? null } : { status: 'anonymous' })
      })
      .catch(() => {
        if (!cancelled) setAccount({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Vuelta del login con ?draft=<uuid>: se recupera (y se consume) el
  // borrador de ESTE entrenador y ESA pestaña. Lo recuperado no es de fiar:
  // BookingFlow comprueba la disponibilidad y el servidor revalida todo.
  useEffect(() => {
    if (!trainerSlug) return
    const url = new URL(window.location.href)
    const draftId = url.searchParams.get('draft')
    if (draftId === null) return
    url.searchParams.delete('draft')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    const storage = browserDraftStorage()
    if (!storage || !isDraftId(draftId)) return
    setRestoredDraft(takeDraft(storage, { trainerSlug, draftId, now: Date.now(), allowedDurations: classDurations }))
    // classDurations viene del servidor y no cambia en esta página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerSlug])

  const bookingPlayer = account.status === 'authenticated' ? account.player : null
  const entryHref = trainerSlug ? `/cuenta/entrar?trainer=${encodeURIComponent(trainerSlug)}` : null
  const completeProfileHref = trainerSlug
    ? `/cuenta/bienvenida?trainer=${encodeURIComponent(trainerSlug)}`
    : '/cuenta/bienvenida'

  const bookingAccount: BookingAccount =
    account.status === 'loading'
      ? { kind: 'loading' }
      : account.status === 'authenticated'
        ? account.player
          ? { kind: 'player', player: account.player }
          : { kind: 'incomplete', completeProfileHref }
        : { kind: 'anonymous' }

  // El encabezado y el fondo interiores los aporta BookingStep1 / el checkout,
  // así evitamos títulos y paddings duplicados. Aquí solo ponemos la banda de
  // contraste que destaca la reserva frente al resto de la página.
  //
  // BookingStep1 pinta su propio `bg-gray-50/50` semitransparente encima, así
  // que las franjas de aire llevan ese mismo velo para que la banda quede de
  // un solo tono y no se vea una costura arriba y abajo.
  return (
    <section
      id="booking-section"
      className="scroll-mt-20 bg-blue-100 border-y border-blue-200"
    >
      <div aria-hidden className="h-6 sm:h-10 bg-gray-50/50" />
      <BookingFlow
        trainerId={trainerId}
        trainerName={trainerName}
        trainerSlug={trainerSlug}
        trainerImageUrl={trainerImageUrl}
        classDurations={classDurations}
        account={bookingAccount}
        restoredDraft={restoredDraft}
      />
      {entryHref && account.status !== 'loading' ? (
        // Acceso a la cuenta de jugador. <a> y no <Link>: sin prefetch de /cuenta/entrar.
        <div className="bg-gray-50/50 px-4 pt-2 pb-6 sm:pb-10 text-center">
          <p className="text-sm text-gray-500">
            {bookingPlayer ? (
              <>
                Reservas como <span className="font-medium text-gray-900">{bookingPlayer.full_name}</span> ·{' '}
                <a
                  href="/cuenta"
                  className="font-medium text-blue-600 hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Tu cuenta
                </a>
              </>
            ) : account.status === 'error' ? (
              <span role="status">
                No hemos podido comprobar tu cuenta de jugador. Recarga la página para reservar con ella, o reserva
                sin cuenta.
              </span>
            ) : account.status === 'authenticated' ? (
              <>
                Completa tu perfil para reservar sin escribir tus datos ·{' '}
                <a
                  href={completeProfileHref}
                  className="font-medium text-blue-600 hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Completar perfil
                </a>
              </>
            ) : (
              <>
                ¿Entrenas con {trainerName}?{' '}
                <a
                  href={entryHref}
                  className="font-medium text-blue-600 hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Entra en tu cuenta de jugador
                </a>
              </>
            )}
          </p>
        </div>
      ) : (
        <div aria-hidden className="h-6 sm:h-10 bg-gray-50/50" />
      )}
    </section>
  )
}
