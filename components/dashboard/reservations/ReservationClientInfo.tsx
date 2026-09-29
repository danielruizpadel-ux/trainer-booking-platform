import type { TrainerReservation } from '@/lib/reservations/queries'
import { whatsappPreference } from '@/lib/reservations/whatsapp'

type Info = Pick<TrainerReservation, 'player_count' | 'client_message' | 'whatsapp_opt_in' | 'notes'>

/** Tabla del dashboard (en inglés): "1 player" / "3 players". */
export function playersLabel(count: number): string {
  return `${count} ${count === 1 ? 'player' : 'players'}`
}

/**
 * Lo que dejó el cliente en el checkout (migración 010), en solo lectura:
 * nº de jugadores, avisos por WhatsApp y su mensaje. El mensaje se pinta como
 * texto (React lo escapa), nunca como HTML. Va separado de las notas
 * internas, que sí son editables.
 */
export function ReservationClientInfo({ reservation: r }: { reservation: Info }) {
  const legacyWhatsapp = r.whatsapp_opt_in === null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-gray-400">Jugadores</dt>
      <dd className="text-gray-900 tabular-nums">{r.player_count}</dd>

      <dt className="text-gray-400">WhatsApp</dt>
      <dd className="text-gray-900">
        {whatsappPreference(r) ? 'Sí, avisos de la reserva' : 'No'}
        {legacyWhatsapp && <span className="text-gray-400"> · reserva antigua</span>}
      </dd>

      <dt className="text-gray-400">Mensaje del cliente</dt>
      <dd className="min-w-0">
        {r.client_message ? (
          <p className="text-gray-900 whitespace-pre-line break-words">{r.client_message}</p>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </dd>
    </dl>
  )
}
