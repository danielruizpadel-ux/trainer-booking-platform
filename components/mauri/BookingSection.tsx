'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import BookingFlow from '@/components/booking/BookingFlow'
import type { BookingAccount, BookingPlayer } from '@/lib/players/booking-contact'
import { browserDraftStorage, discardDraft, peekDraft, updateDraftSelection, type BookingDraft } from '@/lib/booking/draft'
import { isDraftId } from '@/lib/players/entry'
import { publishLiveSelection } from '@/lib/booking/live-selection'

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
  /**
   * `editorial`: landing de Mauri (B v2). El acceso a la cuenta va en la
   * cabecera (MauriHeader), que conserva la selección; aquí solo quedan los
   * avisos de cuenta (error o perfil incompleto).
   */
  variant?: 'default' | 'editorial'
  preview?: boolean
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
  variant = 'default',
  preview = false,
}: BookingSectionProps) {
  const editorial = variant === 'editorial'
  // Cuenta de jugador: con sesión y perfil completo, la reserva usa esos
  // datos y no pide el formulario; con sesión y perfil incompleto, primero se
  // completa el perfil. Si la comprobación falla, se avisa y se puede
  // reservar sin cuenta (como invitado).
  const [account, setAccount] = useState<AccountState>({ status: 'loading' })
  const [restoredDraft, setRestoredDraft] = useState<BookingDraft | null>(null)
  // Borrador vivo (el restaurado, actualizado con los cambios posteriores).
  const activeDraftRef = useRef<BookingDraft | null>(null)

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

  // Vuelta del login con ?draft=<uuid>: se LEE (sin consumir) el borrador de
  // ESTE entrenador y ESA pestaña, y `?draft=` se queda en la URL mientras el
  // borrador siga vivo: así un refresco dentro de su caducidad no pierde la
  // selección. Lo recuperado no es de fiar: BookingFlow vuelve a comprobar la
  // disponibilidad, el precio se recalcula y el servidor revalida todo.
  // El borrador se borra (y `?draft=` se quita) al reservar, al caducar o si
  // no es válido.
  useEffect(() => {
    if (!trainerSlug) return
    const draftId = new URL(window.location.href).searchParams.get('draft')
    if (draftId === null) return
    const storage = browserDraftStorage()
    const draft =
      storage && isDraftId(draftId)
        ? peekDraft(storage, { trainerSlug, draftId, now: Date.now(), allowedDurations: classDurations })
        : null
    if (!draft) {
      stripDraftParam()
      return
    }
    activeDraftRef.current = draft
    setRestoredDraft(draft)
    // classDurations viene del servidor y no cambia en esta página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainerSlug])

  const handleSelectionChange = useCallback(
    (selection: { sessions: Array<{ date: string; time: string }>; duration: number; playerCount: number }) => {
      const draft = activeDraftRef.current
      const storage = browserDraftStorage()
      if (!draft || !storage) return
      const next = updateDraftSelection(storage, draft, selection, { now: Date.now(), allowedDurations: classDurations })
      activeDraftRef.current = next
      if (!next) stripDraftParam()
    },
    [classDurations]
  )

  const handleBooked = useCallback(() => {
    const draft = activeDraftRef.current
    const storage = browserDraftStorage()
    if (draft && storage) discardDraft(storage, draft.trainerSlug, draft.draftId)
    activeDraftRef.current = null
    stripDraftParam()
  }, [])

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

  if (editorial) {
    return (
      <section id="booking-section" className="scroll-mt-16 border-b border-mauri-rule bg-mauri-paper">
        <BookingFlow
          trainerId={trainerId}
          trainerName={trainerName}
          trainerSlug={trainerSlug}
          trainerImageUrl={trainerImageUrl}
          classDurations={classDurations}
          account={bookingAccount}
          restoredDraft={restoredDraft}
          onSelectionChange={handleSelectionChange}
          onBooked={handleBooked}
          onLiveSelection={publishLiveSelection}
          variant="editorial"
          preview={preview}
        />
        {account.status === 'error' && (
          <p role="status" className="mx-auto max-w-6xl px-4 pb-10 text-sm text-mauri-muted sm:px-6 lg:px-8">
            No hemos podido comprobar tu cuenta de jugador. Recarga la página para reservar con ella, o reserva sin cuenta.
          </p>
        )}
      </section>
    )
  }

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
      className="scroll-mt-4 border-y border-[#d9d4c8] bg-[#eeeae1]"
    >
      <div aria-hidden className="h-2 bg-[#f8f5ed]/50 sm:h-4" />
      <BookingFlow
        trainerId={trainerId}
        trainerName={trainerName}
        trainerSlug={trainerSlug}
        trainerImageUrl={trainerImageUrl}
        classDurations={classDurations}
        account={bookingAccount}
        restoredDraft={restoredDraft}
        onSelectionChange={handleSelectionChange}
        onBooked={handleBooked}
      />
      {entryHref && account.status !== 'loading' ? (
        // Acceso a la cuenta de jugador. <a> y no <Link>: sin prefetch de /cuenta/entrar.
        <div className="bg-[#f8f5ed]/50 px-4 pt-2 pb-6 text-center sm:pb-8">
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
        <div aria-hidden className="h-6 bg-[#f8f5ed]/50 sm:h-8" />
      )}
    </section>
  )
}

/** Quita `?draft=` de la URL sin recargar (el borrador ya no se restaura). */
function stripDraftParam() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('draft')) return
  url.searchParams.delete('draft')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}
