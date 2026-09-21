'use client'

import { useState } from 'react'
import type { TrainerReservation } from '@/lib/reservations/queries'
import { ReservationsCalendar } from '@/components/dashboard/reservations/ReservationsCalendar'
import { EditReservationDialog } from '@/components/dashboard/reservations/EditReservationDialog'

interface HomeCalendarSectionProps {
  reservations: TrainerReservation[]
}

/**
 * El calendario semanal/diario del Resumen (antes era la vista "Calendario"
 * de Reservas). Un clic en una clase abre su detalle (EditReservationDialog)
 * ahí mismo, buscando la reserva en el array que llega por prop.
 */
export function HomeCalendarSection({ reservations }: HomeCalendarSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editingReservation = editingId ? (reservations.find((r) => r.id === editingId) ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      <ReservationsCalendar mode="view" onReservationClick={setEditingId} />
      {editingReservation && (
        <EditReservationDialog reservation={editingReservation} onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}
