'use client'

import { useMemo } from 'react'
import EasyWeekSelector from './EasyWeekSelector'
import BookingSummaryCard from './BookingSummaryCard'
import { DurationPicker } from '@/components/dashboard/reservations/DurationPicker'
import { quoteBooking, type SessionPriceRow } from '@/lib/reservations/pricing'
import { durationLabel } from '@/lib/availability/durations'

interface Session {
  date: string
  time: string
}

interface BookingStep1Props {
  trainerId: string
  onConfirm: (sessions: Session[]) => void
  selectedSessions: Session[]
  onSessionChange: (sessions: Session[]) => void
  /** Duración elegida (60/90) y las que ofrece el entrenador */
  duration: number
  classDurations: number[]
  onDurationChange: (value: number) => void
  /** Tabla de precios del entrenador (GET /api/pricing); null mientras carga */
  prices: SessionPriceRow[] | null
}

export default function BookingStep1_SelectSessions({
  trainerId,
  onConfirm,
  selectedSessions,
  onSessionChange,
  duration,
  classDurations,
  onDurationChange,
  prices,
}: BookingStep1Props) {
  // Vista previa con el precio de 1 jugador del entrenador (misma regla que
  // el servidor, lib/reservations/pricing.ts). El nº de jugadores se elige en
  // el checkout; lo que se cobra lo calcula POST /api/reservations.
  const quote = useMemo(
    () => (prices ? quoteBooking(prices, selectedSessions.length, duration, 1) : null),
    [prices, selectedSessions, duration]
  )

  const handleRemove = (date: string, time: string) => {
    onSessionChange(selectedSessions.filter((s) => !(s.date === date && s.time === time)))
  }

  return (
    <section className="py-10 sm:py-14 px-4 sm:px-6 lg:px-8 bg-gray-50/50">
      <div className="max-w-6xl mx-auto">
        {/* id="reserva": destino del CTA del hero, para aterrizar en el selector
            (duración + semana + primeras horas), no en el aire de arriba. */}
        <header id="reserva" className="mb-8 scroll-mt-4">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Selecciona tus clases
          </h2>
          <p className="mt-1.5 text-gray-500">
            Elige los días y las horas que mejor te encajen. Cuantas más reserves, mejor precio.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <DurationPicker durations={classDurations} value={duration} onChange={onDurationChange} />
            <span className="text-sm text-gray-500">
              Clase de {durationLabel(duration)}
              {quote ? ` · desde RM ${quote.pricePerSession}` : prices ? ' · precio no disponible' : ''}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* Vista única de reserva: semana compacta + horas debajo. */}
          <EasyWeekSelector
            trainerId={trainerId}
            selectedSessions={selectedSessions}
            onSessionChange={onSessionChange}
            durationMinutes={duration}
          />

          {/* Panel lateral */}
          <BookingSummaryCard
            sessions={selectedSessions}
            total={quote?.total ?? null}
            discount={quote?.discountPercent ?? 0}
            pricePerSession={quote?.pricePerSession ?? null}
            durationMinutes={duration}
            onRemove={handleRemove}
            onConfirm={() => selectedSessions.length > 0 && onConfirm(selectedSessions)}
          />
        </div>
      </div>
    </section>
  )
}
