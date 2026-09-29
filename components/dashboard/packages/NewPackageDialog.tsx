'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PACKAGE_SIZES, packagePriceQuote, type PackageSize } from '@/lib/packages/pricing'
import { DialogShell, dialogButton } from '@/components/dashboard/DialogShell'
import { ClientFields, type ClientFieldValues } from '@/components/dashboard/reservations/ClientFields'
import { DurationPicker } from '@/components/dashboard/reservations/DurationPicker'
import { durationLabel } from '@/lib/availability/durations'
import { basePriceFor, formatRM } from '@/lib/reservations/pricing'
import { useTrainerPricing } from '@/components/dashboard/useTrainerPricing'

interface NewPackageDialogProps {
  /** Duraciones que ofrece el entrenador (60/90); se fija una para todo el paquete */
  durations: number[]
  onClose: () => void
}

/**
 * "Vender paquete": datos del cliente + tamaño (5/10) con el precio en vivo,
 * calculado con la misma regla del widget sobre el precio de 1 jugador del
 * entrenador (lib/packages/pricing.ts). El que manda es el servidor.
 * POST /api/dashboard/packages.
 */
export function NewPackageDialog({ durations, onClose }: NewPackageDialogProps) {
  const router = useRouter()
  const [client, setClient] = useState<ClientFieldValues>({ client_name: '', client_email: '', client_phone: '', notes: '' })
  const [size, setSize] = useState<PackageSize>(5)
  const [duration, setDuration] = useState<number>(durations[0] ?? 60)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pricing = useTrainerPricing()
  const base = pricing.rows ? basePriceFor(pricing.rows, duration, 1) : null
  const quoteFor = (option: PackageSize) => (base === null ? null : packagePriceQuote(option, base, duration))
  const quote = quoteFor(size)

  async function create() {
    setSending(true)
    setError(null)
    try {
      const response = await fetch('/api/dashboard/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...client, sessions_total: size, duration_minutes: duration }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo crear el paquete')
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el paquete')
      setSending(false)
    }
  }

  return (
    <DialogShell
      eyebrow="Vender paquete"
      title="Nuevo paquete de clases"
      description="El precio queda fijado en el momento de la venta. Las sesiones se agendan después, una a una."
      onClose={onClose}
      locked={sending}
      size="md"
      footer={
        <>
          <p className="text-sm text-gray-600">
            {quote ? (
              <>
                Total: <span className="font-semibold text-gray-900 tabular-nums">{formatRM(quote.total)}</span>
                {quote.discountPercent > 0 && <span className="text-emerald-600"> · {quote.discountPercent} % de descuento</span>}
              </>
            ) : pricing.rows ? (
              <span className="text-red-600">Sin precio para {durationLabel(duration)} (1 jugador): ponlo en Perfil → Public pricing.</span>
            ) : (
              'Cargando precios…'
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={sending} className={dialogButton.secondary}>Cancelar</button>
            <button
              type="button"
              onClick={create}
              disabled={sending || !quote || !client.client_name.trim() || !client.client_email.trim()}
              className={dialogButton.primary}
            >
              {sending ? 'Guardando…' : `Vender paquete de ${size}`}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Duración de las clases</h3>
          <DurationPicker durations={durations} value={duration} onChange={setDuration} disabled={sending} />
          <p className="text-xs text-gray-500">Todas las sesiones del paquete tendrán esta duración.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tamaño</h3>
          <div role="radiogroup" aria-label="Tamaño del paquete" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PACKAGE_SIZES.map((option) => {
              const q = quoteFor(option)
              const selected = size === option
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSize(option)}
                  disabled={sending}
                  className={`rounded-2xl p-4 text-left ring-1 ring-inset transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    selected ? 'ring-blue-600 bg-blue-50/60' : 'ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/40'
                  }`}
                >
                  <p className="text-base font-semibold text-gray-900">{option} clases</p>
                  {q ? (
                    <>
                      <p className="mt-1 text-sm text-gray-600">
                        <span className="tabular-nums">{formatRM(q.discountedPricePerSession)}</span> por clase de {durationLabel(duration)}
                        {q.discountPercent > 0 && (
                          <>
                            {' '}
                            <span className="line-through text-gray-400 tabular-nums">{formatRM(q.pricePerSession)}</span>
                          </>
                        )}
                      </p>
                      <p className="mt-2 text-sm">
                        <span className="font-semibold text-gray-900 tabular-nums">{formatRM(q.total)}</span>
                        {q.discountPercent > 0 && <span className="text-emerald-600"> · −{q.discountPercent} %</span>}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">Sin precio</p>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cliente</h3>
          <ClientFields values={client} onChange={setClient} disabled={sending} idPrefix="package" />
        </section>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </DialogShell>
  )
}
