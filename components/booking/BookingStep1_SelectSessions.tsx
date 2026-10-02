'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** `editorial`: landing de Mauri (B v2). Misma lógica; solo cambia la presentación. */
  variant?: 'default' | 'editorial'
  preview?: boolean
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
  variant = 'default',
  preview = false,
}: BookingStep1Props) {
  const editorial = variant === 'editorial'
  // Vista previa con el precio de 1 jugador del entrenador (misma regla que
  // el servidor, lib/reservations/pricing.ts). El nº de jugadores se elige en
  // el checkout; lo que se cobra lo calcula POST /api/reservations.
  const quote = useMemo(
    () => (prices ? quoteBooking(prices, selectedSessions.length, duration, 1) : null),
    [prices, selectedSessions, duration]
  )
  const summaryRef = useRef<HTMLDivElement>(null)
  const [summaryVisible, setSummaryVisible] = useState(false)

  useEffect(() => {
    const summary = summaryRef.current
    if (!summary) return
    // Editorial: la barra compacta sigue visible hasta que se ve al menos la
    // mitad del resumen (si solo asoma el título, aún no se ve la selección).
    const observer = editorial
      ? new IntersectionObserver(([entry]) => setSummaryVisible(entry.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] })
      : new IntersectionObserver(([entry]) => setSummaryVisible(entry.isIntersecting))
    observer.observe(summary)
    return () => observer.disconnect()
  }, [editorial])

  const handleRemove = (date: string, time: string) => {
    onSessionChange(selectedSessions.filter((s) => !(s.date === date && s.time === time)))
  }
  const lastSelected = selectedSessions[selectedSessions.length - 1]

  if (editorial) {
    const firstSelected = [...selectedSessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0]
    const count = selectedSessions.length
    return (
      <section className="bg-mauri-paper px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header id="reserva" className="mb-7 flex scroll-mt-24 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-mauri-teal">
                <span className="font-mauri-display text-[13px] font-bold tracking-[0.1em] text-mauri-graphite">01</span>
                Agenda semanal
              </p>
              <h2 className="mt-3 font-mauri-display text-3xl font-extrabold uppercase leading-none text-mauri-graphite">
                Elige tus clases
              </h2>
              <p className="mt-3 max-w-xl font-mauri-serif text-lg leading-snug text-mauri-ink-2">
                Una o varias horas, en uno o varios días. Todo queda en tu reserva antes de enviarla.
              </p>
              {preview && <p className="mt-2 text-xs text-mauri-teal">Club / sede: <span className="rounded border border-dashed border-current px-2 py-0.5">Pendiente de confirmar</span></p>}
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end">
              <EditorialDurationPicker durations={classDurations} value={duration} onChange={onDurationChange} />
              <span className="text-sm text-mauri-muted">
                Clase de {durationLabel(duration)}
                {quote ? ` · desde RM ${quote.pricePerSession}` : prices ? ' · precio no disponible' : ''}
              </span>
            </div>
          </header>

          {/* Calendario y resumen comparten línea inferior en escritorio (stretch). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-stretch">
            <EasyWeekSelector
              trainerId={trainerId}
              selectedSessions={selectedSessions}
              onSessionChange={onSessionChange}
              durationMinutes={duration}
              variant="editorial"
            />
            <div ref={summaryRef} id="resumen-mauri" className="scroll-mt-24">
              <BookingSummaryCard
                sessions={selectedSessions}
                total={quote?.total ?? null}
                discount={quote?.discountPercent ?? 0}
                pricePerSession={quote?.pricePerSession ?? null}
                durationMinutes={duration}
                onRemove={handleRemove}
                onConfirm={() => selectedSessions.length > 0 && onConfirm(selectedSessions)}
                variant="editorial"
              />
            </div>
          </div>
          {firstSelected && !summaryVisible && (
            <div
              className="fixed inset-x-3 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-mauri-graphite px-4 py-3 text-mauri-paper ring-1 ring-mauri-graphite-line lg:hidden"
              style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
              role="status"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mauri-teal-light">
                  Tu reserva · {count} {count === 1 ? 'clase' : 'clases'}
                </p>
                <p className="mt-1 truncate text-sm font-medium tabular-nums">
                  {new Date(`${firstSelected.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} ·{' '}
                  {firstSelected.time.slice(0, 5)}
                  {count > 1 ? `  +${count - 1} más` : ''}
                </p>
              </div>
              <a
                href="#resumen-mauri"
                className="shrink-0 rounded-md bg-mauri-teal px-4 py-2.5 font-mauri-display text-sm font-bold uppercase tracking-[0.08em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mauri-teal-light"
              >
                Ver resumen
              </a>
            </div>
          )}
        </div>
      </section>
    )
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

          {/* En móvil, el enlace compacto mantiene visible la selección mientras
              el resumen completo sigue inmediatamente después del calendario. */}
          <div ref={summaryRef} id="resumen-mauri" className="scroll-mt-4 lg:sticky lg:top-6">
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
        {lastSelected && !summaryVisible && (
          <div
            className="fixed inset-x-3 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[#252824] px-4 py-3 text-[#f8f5ed] ring-1 ring-[#f8f5ed]/30 lg:hidden"
            style={{ bottom: 'max(12px, env(safe-area-inset-bottom))' }}
            role="status"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#d8d1bf]">
                Tu reserva · {selectedSessions.length} {selectedSessions.length === 1 ? 'clase' : 'clases'}
              </p>
              <p className="truncate text-sm font-medium">
                {new Date(`${lastSelected.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {lastSelected.time.slice(0, 5)}
              </p>
            </div>
            <a
              href="#resumen-mauri"
              className="shrink-0 rounded-full bg-[#f8f5ed] px-4 py-2 text-xs font-semibold text-[#252824] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f8f5ed]"
            >
              Ver resumen
            </a>
          </div>
        )}
      </div>
    </section>
  )
}

/** Selector 1 h / 1 h 30 con la estética editorial; misma semántica que DurationPicker. */
function EditorialDurationPicker({
  durations,
  value,
  onChange,
}: {
  durations: number[]
  value: number
  onChange: (value: number) => void
}) {
  if (durations.length <= 1) {
    return (
      <p className="text-sm text-mauri-ink-2">
        Clases de <span className="font-semibold text-mauri-graphite">{durationLabel(durations[0] ?? 60)}</span>.
      </p>
    )
  }
  return (
    <div role="radiogroup" aria-label="Duración" className="inline-flex rounded-md bg-white p-1 ring-1 ring-inset ring-mauri-rule-2">
      {durations.map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={value === d}
          onClick={() => onChange(d)}
          className={`h-9 rounded px-4 font-mauri-display text-sm font-bold uppercase tracking-[0.08em] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal ${
            value === d ? 'bg-mauri-graphite text-mauri-paper' : 'text-mauri-muted hover:text-mauri-graphite'
          }`}
        >
          {durationLabel(d)}
        </button>
      ))}
    </div>
  )
}
