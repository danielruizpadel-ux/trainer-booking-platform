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
}

export default function BookingSummaryCard({
  sessions,
  total,
  discount,
  pricePerSession,
  durationMinutes = 60,
  onRemove,
  onConfirm,
}: BookingSummaryCardProps) {
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
