'use client'

import { useState } from 'react'
import type { TrainerReservation } from '@/lib/reservations/queries'
import type { SlotPick } from '@/lib/reservations/calendar'
import { ReservationsCalendar } from '@/components/dashboard/reservations/ReservationsCalendar'
import { EditReservationDialog } from '@/components/dashboard/reservations/EditReservationDialog'
import { NewReservationDialog } from '@/components/dashboard/reservations/NewReservationDialog'

interface HomeCalendarSectionProps {
  reservations: TrainerReservation[]
  /** Duraciones que ofrece el entrenador (60/90), para "Nueva reserva" */
  durations: number[]
}

/**
 * El calendario semanal/diario del Resumen (antes era la vista "Calendario"
 * de Reservas). Un clic en una clase abre su detalle (EditReservationDialog)
 * ahí mismo, buscando la reserva en el array que llega por prop. Un clic en
 * un hueco libre abre "Nueva reserva" con esa fecha, hora y duración ya
 * puestas; al crearla, el calendario se recarga.
 */
export function HomeCalendarSection({ reservations, durations }: HomeCalendarSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState<SlotPick | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const editingReservation = editingId ? (reservations.find((r) => r.id === editingId) ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      <ReservationsCalendar mode="view" onReservationClick={setEditingId} onCreateAt={setCreating} refreshKey={refreshKey} />
      {editingReservation && (
        <EditReservationDialog reservation={editingReservation} onClose={() => setEditingId(null)} />
      )}
      {creating && (
        <NewReservationDialog
          durations={durations}
          initialSlot={creating}
          onCreated={() => setRefreshKey((k) => k + 1)}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  )
}
