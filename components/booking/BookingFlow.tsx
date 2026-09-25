'use client'

import { useEffect, useRef, useState } from 'react'
import BookingStep1_SelectSessions from './BookingStep1_SelectSessions'
import { BookingCheckout, CheckoutError, type CheckoutSubmit } from './checkout/BookingCheckout'
import type { SessionPriceRow } from '@/lib/reservations/pricing'
import type { BookingAccount } from '@/lib/players/booking-contact'
import type { BookingDraft } from '@/lib/booking/draft'

type ViewType = 'month' | 'week' | 'day'

interface Session {
  date: string
  time: string
}

interface BookingFlowProps {
  trainerId: string
  trainerName: string
  /** Slug público: habilita "Continue with my account" y el borrador */
  trainerSlug?: string
  trainerImageUrl?: string | null
  /** Duraciones de clase que ofrece el entrenador (60/90); la primera es la inicial */
  classDurations?: number[]
  /**
   * Cuenta de jugador (ver BookingAccount). Con `player`, el checkout enseña
   * sus datos y el servidor toma identidad y contacto de la sesión
   * (`as_player`). Sin la prop, reserva como invitado.
   */
  account?: BookingAccount
  /**
   * Borrador recuperado al volver del login (lib/booking/draft.ts). NO es de
   * fiar: aquí solo se usa para rellenar la selección tras comprobar la
   * disponibilidad; el servidor revalida todo al confirmar.
   */
  restoredDraft?: BookingDraft | null
  /**
   * Cambios de selección DESPUÉS de restaurar un borrador (sesiones que
   * siguen libres, duración, jugadores). Solo datos no personales; con ellos
   * BookingSection mantiene el borrador al día para que un refresco no lo pierda.
   */
  onSelectionChange?: (selection: { sessions: Session[]; duration: number; playerCount: number }) => void
  /** La reserva se creó (201): el borrador ya no debe restaurarse. */
  onBooked?: () => void
}

export default function BookingFlow({
  trainerId,
  trainerName,
  trainerSlug,
  trainerImageUrl = null,
  classDurations = [60],
  account = { kind: 'anonymous' },
  restoredDraft = null,
  onSelectionChange,
  onBooked,
}: BookingFlowProps) {
  const [step, setStep] = useState<'selection' | 'contact'>('selection')
  const [selectedSessions, setSelectedSessions] = useState<Session[]>([])
  const [duration, setDuration] = useState<number>(classDurations[0] ?? 60)
  const [playerCount, setPlayerCount] = useState(1)
  const [currentView, setCurrentView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [prices, setPrices] = useState<SessionPriceRow[] | null>(null)
  const [pricesError, setPricesError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Hasta que el borrador se ha restaurado no se informa de cambios: la
  // selección vacía inicial borraría el borrador antes de usarlo.
  const [restoreDone, setRestoreDone] = useState(false)
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange

  // Tabla de precios vigente del entrenador: solo vista previa.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/pricing?trainer_id=${encodeURIComponent(trainerId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => null)
        if (!r.ok || !data?.success) throw new Error('Pricing is unavailable right now.')
        if (!cancelled) setPrices(data.prices)
      })
      .catch((err) => {
        if (!cancelled) setPricesError(err instanceof Error ? err.message : 'Pricing is unavailable right now.')
      })
    return () => {
      cancelled = true
    }
  }, [trainerId])

  // Borrador al volver del login: se quedan solo las sesiones que SIGUEN
  // siendo reservables (misma API que el calendario), con la hora tal como la
  // devuelve la API para que el calendario las reconozca.
  useEffect(() => {
    if (!restoredDraft) return
    let cancelled = false
    const dates = restoredDraft.sessions.map((s) => s.date).sort()
    const params = new URLSearchParams({
      trainer_id: trainerId,
      start_date: dates[0],
      end_date: dates[dates.length - 1],
      duration: String(restoredDraft.duration),
    })
    fetch(`/api/availability?${params.toString()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { success?: boolean; data?: Array<{ session_date: string; start_time: string }> }) => {
        if (cancelled) return
        const slots = data?.success && Array.isArray(data.data) ? data.data : []
        const still = restoredDraft.sessions.flatMap((s) => {
          const slot = slots.find((x) => x.session_date === s.date && x.start_time.slice(0, 5) === s.time)
          return slot ? [{ date: s.date, time: slot.start_time }] : []
        })
        setDuration(restoredDraft.duration)
        setPlayerCount(restoredDraft.playerCount)
        setSelectedSessions(still)
        setRestoreDone(true)
        const removed = restoredDraft.sessions.length - still.length
        if (still.length === 0) {
          setNotice(null)
          setStep('selection')
          return
        }
        setNotice(
          removed > 0
            ? `${removed} of your selected ${removed === 1 ? 'session is' : 'sessions are'} no longer available and ${removed === 1 ? 'was' : 'were'} removed.`
            : null
        )
        setStep('contact')
      })
      .catch(() => {
        // Sin disponibilidad no se restaura nada: se vuelve a elegir.
      })
    return () => {
      cancelled = true
    }
  }, [restoredDraft, trainerId])

  useEffect(() => {
    if (!restoreDone) return
    onSelectionChangeRef.current?.({ sessions: selectedSessions, duration, playerCount })
  }, [restoreDone, selectedSessions, duration, playerCount])

  const handleConfirmSessions = (sessions: Session[]) => {
    setSelectedSessions(sessions)
    setNotice(null)
    setStep('contact')
  }

  // Un único sitio construye la petición. Sin precio, sin player_id: los
  // pone el servidor. Con cuenta no se mandan datos de contacto.
  const handleConfirmReservation = async ({ playerCount: players, clientMessage, guest }: CheckoutSubmit) => {
    const common = {
      trainer_id: trainerId,
      sessions: selectedSessions,
      duration_minutes: duration,
      player_count: players,
      client_message: clientMessage,
    }
    const body =
      account.kind === 'player'
        ? { ...common, as_player: true }
        : {
            ...common,
            client_name: guest?.name ?? '',
            client_email: guest?.email ?? '',
            client_phone: guest?.phone ?? '',
            client_whatsapp_opt_in: guest?.whatsapp ?? false,
          }

    const response = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) {
      throw new CheckoutError(data.error || "We couldn't create your booking. Please try again.", response.status)
    }
    onBooked?.()
  }

  return (
    <div className="w-full">
      {/* La navbar del calendario vive dentro de AvailabilityCalendar (una sola) */}
      {step === 'selection' && (
        <BookingStep1_SelectSessions
          trainerId={trainerId}
          duration={duration}
          classDurations={classDurations}
          prices={prices}
          onDurationChange={(value) => {
            // Las horas libres dependen de la duración: se vacía la selección.
            setDuration(value)
            setSelectedSessions([])
          }}
          selectedSessions={selectedSessions}
          onSessionChange={setSelectedSessions}
          onConfirm={handleConfirmSessions}
          currentView={currentView}
          currentDate={currentDate}
          onViewChange={setCurrentView}
          onDateChange={setCurrentDate}
        />
      )}

      {step === 'contact' && (
        <BookingCheckout
          trainerName={trainerName}
          trainerSlug={trainerSlug}
          trainerImageUrl={trainerImageUrl}
          sessions={selectedSessions}
          duration={duration}
          prices={prices}
          pricesError={pricesError}
          playerCount={playerCount}
          onPlayerCountChange={setPlayerCount}
          account={account}
          notice={notice}
          onBack={() => setStep('selection')}
          onSubmit={handleConfirmReservation}
        />
      )}
    </div>
  )
}
