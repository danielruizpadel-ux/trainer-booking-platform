'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { RangeSelection } from '@/lib/reservations/calendar'
import { durationLabel } from '@/lib/availability/durations'
import { addMinutes, toMinutes } from '@/lib/availability/windows'
import { formatDayShort } from '@/lib/reservations/format'
import { checkOneOffRange, durationForSelection } from '@/lib/reservations/one-off-rules'
import { DialogShell, dialogButton } from '@/components/dashboard/DialogShell'
import { DurationPicker } from './DurationPicker'

interface RangeSelectionDialogProps {
  selection: RangeSelection
  /** Duraciones que ofrece el entrenador (60/90) */
  durations: number[]
  onClose: () => void
  /** «Crear clase puntual» con la duración elegida (aún sin guardar: sigue en los datos del cliente) */
  onCreateOneOff: (pick: { session_date: string; start_time: string; duration_minutes: number }) => void
}

/**
 * Lo que aparece al soltar un tramo arrastrado en el calendario del Resumen:
 * fecha, inicio y fin. No guarda nada.
 *
 *   «Crear clase puntual» (principal): reservar ese tramo para un cliente,
 *     una sola vez, aunque esté fuera del horario. Sigue en "Nueva reserva"
 *     (datos del cliente) y lo guarda POST /api/dashboard/reservations/one-off.
 *   «Abrir disponibilidad» (secundaria): lleva al editor del horario
 *     habitual, que se repite cada semana y se ve en la web.
 *
 * Si el tramo no mide una duración que ofrece el entrenador, se elige una
 * (empezando a la misma hora). Los avisos (pasado, pisa una reserva) salen de
 * checkOneOffRange, la misma regla que aplica el servidor.
 */
export function RangeSelectionDialog({ selection, durations, onClose, onCreateOneOff }: RangeSelectionDialogProps) {
  const length = toMinutes(selection.end_time) - toMinutes(selection.start_time)
  const exact = durationForSelection(length, durations)
  const sorted = [...durations].sort((a, b) => a - b)
  const [duration, setDuration] = useState<number>(exact ?? sorted[0] ?? 60)
  const check = checkOneOffRange({ session_date: selection.session_date, start_time: selection.start_time, duration_minutes: duration }, durations, selection.taken)
  const classEnd = addMinutes(selection.start_time, duration)

  return (
    <DialogShell
      eyebrow="Tramo seleccionado"
      title={`${formatDayShort(selection.session_date)} · ${selection.start_time} – ${selection.end_time}`}
      description={`${durationLabel(length)}. Todavía no se ha guardado nada.`}
      onClose={onClose}
      size="md"
      footer={
        <div className="flex w-full justify-end">
          <button type="button" onClick={onClose} className={dialogButton.secondary}>
            Cancelar
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {exact === null && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-600">
              Una clase dura {sorted.map(durationLabel).join(' o ')}. Elige cuál, empezando a las {selection.start_time}:
            </p>
            <DurationPicker durations={sorted} value={duration} onChange={setDuration} />
          </div>
        )}

        <section className="flex flex-col gap-3 rounded-xl bg-blue-50/60 p-4 ring-1 ring-inset ring-blue-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Clase puntual · {selection.start_time} – {classEnd}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Para un cliente y solo esta vez, aunque sea fuera de tu horario. No abre huecos en tu web ni cambia tu horario semanal.
            </p>
          </div>
          {!check.ok && (
            <p role="alert" className="text-sm text-red-600">
              {check.message}.
            </p>
          )}
          <button
            type="button"
            data-autofocus
            disabled={!check.ok}
            onClick={() => onCreateOneOff({ session_date: selection.session_date, start_time: selection.start_time, duration_minutes: duration })}
            className={`${dialogButton.primary} self-start`}
          >
            Crear clase puntual
          </button>
        </section>

        <section className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-inset ring-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Cambiar tu horario habitual</h3>
            <p className="mt-1 text-sm text-gray-600">
              Te lleva a Disponibilidad, donde cambias el horario que se repite cada semana. Lo que abras ahí lo pueden reservar tus clientes en la web.
            </p>
          </div>
          <Link href="/dashboard/disponibilidad" className={`${dialogButton.secondary} self-start`}>
            Abrir disponibilidad
          </Link>
        </section>
      </div>
    </DialogShell>
  )
}
