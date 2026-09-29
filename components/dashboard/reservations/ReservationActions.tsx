'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProposeRescheduleDialog } from './ProposeRescheduleDialog'
import { ActionsMenu, type ActionsMenuItem } from './ActionsMenu'

interface ReservationActionsProps {
  reservationId: string
  clientName: string
  durationMinutes: number
  /** 'sm' para la fila de la tabla; el normal para la tarjeta móvil */
  size?: 'sm' | 'md'
  /** En la tabla: uno debajo del otro, para que la fila no desborde */
  stacked?: boolean
  /** En la tabla: deja la decisión principal visible y agrupa las secundarias. */
  compact?: boolean
  /** En modo compacto: opciones extra al final del menú (p. ej. Edit). */
  extraMenuItems?: ActionsMenuItem[]
}

type Pending = 'confirm' | 'needs_reschedule' | null


/**
 * Las tres opciones sobre una reserva pendiente:
 *   Confirm class            PATCH { action: 'confirm' }
 *   No court available       PATCH { action: 'needs_reschedule' }
 *   Propose another time     abre el calendario en modo selector (ProposeRescheduleDialog)
 * En la tabla (compact) solo Confirm queda a la vista; el resto va en "More actions".
 * Al terminar se refresca la página (Server Component) y la fila cambia de pestaña.
 */
export function ReservationActions({ reservationId, clientName, durationMinutes, size = 'md', stacked = false, compact = false, extraMenuItems = [] }: ReservationActionsProps) {
  const router = useRouter()
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)

  async function decide(action: Exclude<Pending, null>) {
    setError(null)
    setPending(action)
    try {
      const response = await fetch(`/api/dashboard/reservations/${reservationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Could not save the decision.')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the decision.')
      setPending(null)
    }
  }

  const busy = pending !== null
  const height = size === 'sm' ? 'h-9 px-3' : 'h-11 px-5'
  const layout = stacked ? 'flex-col items-stretch' : 'flex-col sm:flex-row sm:flex-wrap'
  const primary = `${height} rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2 whitespace-nowrap`
  const secondary = `${height} rounded-xl bg-white text-gray-900 text-sm font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2 whitespace-nowrap`

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex ${compact ? 'flex-col items-stretch' : layout} gap-2`}>
        <button type="button" onClick={() => decide('confirm')} disabled={busy} className={primary}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5L20 7" />
          </svg>
          {pending === 'confirm' ? 'Confirming…' : 'Confirm class'}
        </button>
        {!compact && <button type="button" onClick={() => decide('needs_reschedule')} disabled={busy} className={secondary}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          {pending === 'needs_reschedule' ? 'Saving…' : 'No court available'}
        </button>}
        {!compact && <button type="button" onClick={() => setProposing(true)} disabled={busy} className={secondary}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
          </svg>
          Propose another time
        </button>}
        {compact && (
          <ActionsMenu
            label={pending === 'needs_reschedule' ? 'Saving…' : 'More actions'}
            buttonClassName={`${secondary} text-gray-700`}
            items={[
              { label: 'No court available', onSelect: () => decide('needs_reschedule'), disabled: busy },
              { label: 'Propose another time', onSelect: () => setProposing(true), disabled: busy },
              ...extraMenuItems,
            ]}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {proposing && (
        <ProposeRescheduleDialog
          reservationId={reservationId}
          clientName={clientName}
          durationMinutes={durationMinutes}
          onClose={() => setProposing(false)}
          onProposed={() => {
            setProposing(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
