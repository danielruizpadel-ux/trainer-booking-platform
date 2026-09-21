'use client'

import { useState } from 'react'
import type { TrainerReservation } from '@/lib/reservations/queries'
import { isAwaitingConfirmation, isRescheduleProposed } from '@/lib/reservations/status'
import { ReservationActions } from './ReservationActions'
import { ProposalLink } from './ProposalLink'
import { EditReservationDialog } from './EditReservationDialog'

interface ReservationRowActionsProps {
  reservation: TrainerReservation
  size?: 'sm' | 'md'
  stacked?: boolean
}

/**
 * Acciones de una fila, en cualquier pestaña:
 *   pending_confirmation  confirmar / no conseguí pista / proponer otra fecha
 *   reschedule_proposed   copiar el enlace de la propuesta
 *   todas                 Editar (datos, precio, horario, confirmar, cancelar)
 */
export function ReservationRowActions({ reservation, size = 'md', stacked = false }: ReservationRowActionsProps) {
  const [editing, setEditing] = useState(false)
  const height = size === 'sm' ? 'h-9 px-3' : 'h-11 px-5'

  return (
    <div className={`flex ${stacked ? 'flex-col items-stretch' : 'flex-col sm:flex-row sm:flex-wrap'} gap-2`}>
      {isAwaitingConfirmation(reservation.status) && (
        <ReservationActions reservationId={reservation.id} clientName={reservation.client_name} durationMinutes={reservation.duration_minutes ?? 60} size={size} stacked={stacked} />
      )}
      {isRescheduleProposed(reservation.status) && <ProposalLink token={reservation.proposal_token} size={size} />}

      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`${height} rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        Editar
      </button>

      {editing && <EditReservationDialog reservation={reservation} onClose={() => setEditing(false)} />}
    </div>
  )
}
