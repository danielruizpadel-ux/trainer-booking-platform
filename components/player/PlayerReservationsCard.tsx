import { getPlayerSession } from '@/lib/auth/current-player'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { formatDurationEn, formatSessionDateEn, formatSessionTimeEn } from '@/lib/booking/format-en'
import { listPlayerReservations, type PlayerReservationRow as PlayerReservation } from '@/lib/players/reservations'

/*
 * Server Component (SIN 'use server': esa directiva convertiría la función en
 * una Server Action invocable desde el navegador con argumentos del llamador).
 * No recibe props: el jugador sale SOLO de la sesión de esta petición.
 */

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function statusLabel(status: string | null): string {
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'needs_reschedule' || status === 'reschedule_proposed') return 'Needs a new time'
  return 'Pending confirmation'
}

export async function PlayerReservationsCard() {
  // getPlayerSession() está en cache(): es la misma sesión que ya resolvió la página.
  const { player } = await getPlayerSession()
  if (!player) return null

  const result = await listPlayerReservations(getSupabaseServerClient(), player.id)

  if (!result.ok) {
    return <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6"><h2 className="text-base font-semibold text-gray-900">Your bookings</h2><p className="mt-2 text-sm text-gray-500">Bookings are temporarily unavailable.</p></section>
  }

  const rows = result.rows
  const now = Date.now()
  const upcoming = rows.filter((row) => {
    const slot = one(row.availability_slots)
    return slot ? new Date(`${slot.session_date}T${(row.start_time ?? slot.start_time).slice(0, 8)}+08:00`).getTime() >= now : true
  })
  const history = rows.filter((row) => !upcoming.includes(row))

  return (
    <section className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      <h2 className="text-base font-semibold text-gray-900">Your bookings</h2>
      <p className="mt-1 text-sm text-gray-500">Upcoming sessions and their current status.</p>
      {upcoming.length === 0 ? <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">You have no upcoming bookings.</p> : <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">{upcoming.map((row) => <ReservationRow key={row.id} row={row} />)}</ul>}
      {history.length > 0 && <details className="mt-5 border-t border-gray-100 pt-4"><summary className="cursor-pointer text-sm font-semibold text-gray-700">Booking history ({history.length})</summary><ul className="mt-2 divide-y divide-gray-100">{history.map((row) => <ReservationRow key={row.id} row={row} />)}</ul></details>}
    </section>
  )
}

function ReservationRow({ row }: { row: PlayerReservation }) {
  const slot = one(row.availability_slots)
  const trainer = one(row.trainers)
  if (!slot || !trainer) return null
  const start = row.start_time ?? slot.start_time
  const duration = row.duration_minutes ?? Math.max(0, toMinutes(row.end_time ?? slot.end_time) - toMinutes(start))
  return <li className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{trainer.name}</p><p className="mt-1 text-sm text-gray-600">{formatSessionDateEn(slot.session_date)} · {formatSessionTimeEn(start)} · {formatDurationEn(duration)}</p></div><span className="self-start sm:self-auto rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">{statusLabel(row.status)}</span></li>
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}
