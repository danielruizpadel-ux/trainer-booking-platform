'use client'

import SessionSelector from '@/components/trainer/calendar/SessionSelector'

interface Session {
  date: string
  time: string
}

interface BookingSummaryCardProps {
  sessions: Session[]
  /** null: el entrenador no tiene precio para esta duración (o aún carga) */
  total: number | null
  discount: number
  /** Precio base de 1 jugador (la vista previa); null si no hay precio */
  pricePerSession: number | null
  durationMinutes?: number
  onRemove?: (date: string, time: string) => void
  onConfirm?: () => void
  /** `editorial`: landing de Mauri (B v2). Mismos datos y acciones; solo cambia la presentación. */
  variant?: 'default' | 'editorial'
}

export default function BookingSummaryCard({
  sessions,
  total,
  discount,
  pricePerSession,
  durationMinutes = 60,
  onRemove,
  onConfirm,
  variant = 'default',
}: BookingSummaryCardProps) {
  if (variant === 'editorial') {
    return (
      <EditorialSummary
        sessions={sessions}
        total={total}
        discount={discount}
        pricePerSession={pricePerSession}
        durationMinutes={durationMinutes}
        onRemove={onRemove}
        onConfirm={onConfirm}
      />
    )
  }
  const count = sessions.length
  const subtotal = pricePerSession === null ? null : Math.round(count * pricePerSession * 100) / 100
  const discountAmount = subtotal === null || total === null ? 0 : Math.round((subtotal - total) * 100) / 100

  const nextTier = count < 5 ? { need: 5 - count, pct: 10 } : count < 10 ? { need: 10 - count, pct: 15 } : null

  return (
    <div className="lg:sticky lg:top-6 bg-white rounded-2xl ring-1 ring-gray-200/70 p-6">
      <h3 className="text-lg font-semibold text-gray-900">Tu reserva</h3>

      {count === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Aún no has elegido ninguna clase</p>
          <p className="mt-1 text-xs text-gray-400">Selecciona un día en el calendario</p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <SessionSelector sessions={sessions} onRemove={onRemove || (() => {})} />
          </div>

          {pricePerSession === null || total === null ? (
            <p className="mt-5 pt-5 border-t border-gray-100 text-sm text-gray-500">Precio no disponible ahora mismo.</p>
          ) : (
          <div className="mt-5 pt-5 border-t border-gray-100 space-y-2.5">
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                {count} {count === 1 ? 'clase' : 'clases'} de {durationMinutes === 90 ? '1 h 30' : '1 h'} × RM {pricePerSession}
              </span>
              <span className="tabular-nums">RM {subtotal}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-sm font-medium text-emerald-600">
                <span>Descuento {discount}%</span>
                <span className="tabular-nums">−RM {discountAmount}</span>
              </div>
            )}

            <div className="flex justify-between items-baseline pt-2.5 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-900">Total</span>
              <span className="text-2xl font-bold text-gray-900 tabular-nums">RM {total}</span>
            </div>
            <p className="text-xs text-gray-400">Precio con 1 jugador. Eliges cuántos venís en el siguiente paso.</p>
          </div>
          )}

          {nextTier && (
            <div className="mt-4 rounded-lg bg-blue-50 px-3 py-2.5">
              <p className="text-xs text-blue-700">
                Añade <strong>{nextTier.need}</strong> {nextTier.need === 1 ? 'clase' : 'clases'} más y
                consigue un <strong>{nextTier.pct}%</strong> de descuento
              </p>
            </div>
          )}
        </>
      )}

      {onConfirm && (
        <button
          onClick={onConfirm}
          disabled={count === 0}
          className={`mt-6 w-full h-12 rounded-xl font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            count === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25'
          }`}
        >
          {count === 0 ? 'Continuar' : `Continuar · ${count} ${count === 1 ? 'clase' : 'clases'}`}
        </button>
      )}
    </div>
  )
}

/** Hora de fin "HH:MM" a partir de "HH:MM[:SS]" + minutos. */
function endTime(time: string, minutes: number): string {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Resumen grafito de la landing de Mauri. Misma información y reglas que la
 * tarjeta por defecto (precio de 1 jugador como vista previa, descuento por
 * volumen, quitar sesiones, continuar); llena la altura de su columna para
 * compartir línea inferior con el calendario.
 */
function EditorialSummary({
  sessions,
  total,
  discount,
  pricePerSession,
  durationMinutes = 60,
  onRemove,
  onConfirm,
}: Omit<BookingSummaryCardProps, 'variant'>) {
  const count = sessions.length
  const subtotal = pricePerSession === null ? null : Math.round(count * pricePerSession * 100) / 100
  const discountAmount = subtotal === null || total === null ? 0 : Math.round((subtotal - total) * 100) / 100
  const nextTier = count < 5 ? { need: 5 - count, pct: 10 } : count < 10 ? { need: 10 - count, pct: 15 } : null
  const sorted = [...sessions].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
  const durationText = durationMinutes === 90 ? '1 h 30' : '1 h'

  return (
    <div className="flex h-full flex-col rounded-lg bg-mauri-graphite p-5 text-mauri-paper sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-mauri-display text-2xl font-extrabold uppercase leading-none">Tu reserva</h3>
        {count > 0 && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mauri-teal-light tabular-nums">
            {count} {count === 1 ? 'clase' : 'clases'}
          </span>
        )}
      </div>

      {count === 0 ? (
        <div className="flex flex-1 flex-col justify-center gap-2 py-8">
          <svg aria-hidden width="64" height="40" viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 text-mauri-graphite-line">
            <rect x="1" y="1" width="62" height="38" rx="2" />
            <path d="M32 1v38M1 20h62M14 1v38M50 1v38" />
          </svg>
          <p className="font-mauri-serif text-xl leading-snug">Aún no has elegido ninguna clase</p>
          <p className="text-sm text-mauri-muted-d">Elige un día y una hora en la agenda.</p>
        </div>
      ) : (
        <>
          <ul className="mt-4 max-h-72 overflow-y-auto border-y border-mauri-graphite-line">
            {sorted.map((s) => {
              const d = new Date(`${s.date}T12:00:00`)
              const weekday = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
              const month = d.toLocaleDateString('es-ES', { month: 'long' })
              const label = `${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}, ${s.time.slice(0, 5)}`
              return (
                <li
                  key={`${s.date}-${s.time}`}
                  className="grid grid-cols-[48px_1fr_auto] items-center gap-3 border-t border-mauri-graphite-line py-2.5 first:border-t-0 motion-safe:animate-mauri-fade"
                >
                  <span className="grid justify-items-start gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mauri-muted-d">{weekday}</span>
                    <span className="font-mauri-display text-2xl font-bold leading-none tabular-nums">{d.getDate()}</span>
                  </span>
                  <span>
                    <span className="block text-base font-semibold tabular-nums">
                      {s.time.slice(0, 5)} – {endTime(s.time, durationMinutes)}
                    </span>
                    <span className="mt-0.5 block text-xs text-mauri-muted-d">
                      {durationText} · {month}
                    </span>
                  </span>
                  {onRemove && (
                    <button
                      type="button"
                      onClick={() => onRemove(s.date, s.time)}
                      aria-label={`Quitar ${label}`}
                      className="flex h-8 w-8 items-center justify-center rounded text-mauri-muted-d transition-colors hover:bg-mauri-graphite-2 hover:text-mauri-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {pricePerSession === null || total === null ? (
            <p className="mt-4 text-sm text-mauri-muted-d">Precio no disponible ahora mismo.</p>
          ) : (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between gap-3 text-sm text-mauri-muted-d">
                <span>
                  {count} × {durationText} · RM {pricePerSession}
                </span>
                <span className="tabular-nums">RM {subtotal}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between gap-3 text-sm font-medium text-mauri-teal-light">
                  <span>Descuento {discount}%</span>
                  <span className="tabular-nums">−RM {discountAmount}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-mauri-paper">Total</span>
                <span className="font-mauri-display text-3xl font-bold tabular-nums">RM {total}</span>
              </div>
              <p className="text-xs text-mauri-muted-d">Precio con 1 jugador. Eliges cuántos venís en el siguiente paso.</p>
            </div>
          )}

          {nextTier && (
            <p className="mt-3 rounded bg-mauri-graphite-2 px-3 py-2 text-xs text-mauri-teal-light">
              Añade <strong className="font-semibold">{nextTier.need}</strong> {nextTier.need === 1 ? 'clase' : 'clases'} más y consigue un{' '}
              <strong className="font-semibold">{nextTier.pct}%</strong> de descuento
            </p>
          )}
        </>
      )}

      <div className="mt-auto pt-5">
        <p className="mb-3 rounded bg-mauri-graphite-2 px-3 py-2.5 text-xs leading-relaxed text-mauri-muted-d">
          <strong className="font-semibold text-mauri-paper">Es una solicitud.</strong> La clase queda confirmada cuando el entrenador reserve la pista.
        </p>
        {onConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={count === 0}
            className={`h-12 w-full rounded-md font-mauri-display text-base font-bold uppercase tracking-[0.09em] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light focus-visible:ring-offset-2 focus-visible:ring-offset-mauri-graphite ${
              count === 0 ? 'cursor-not-allowed bg-mauri-graphite-2 text-[#6F787B]' : 'bg-mauri-teal text-white hover:bg-mauri-teal-ink active:scale-[0.98]'
            }`}
          >
            {count === 0 ? 'Continuar' : `Continuar · ${count} ${count === 1 ? 'clase' : 'clases'}`}
          </button>
        )}
      </div>
    </div>
  )
}
