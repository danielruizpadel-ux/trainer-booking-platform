'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { CoachAvatar } from './CoachAvatar'
import { ProgramIcon } from './ProgramIcon'
import { SAMPLE_COACHES } from '@/lib/programs/sample-data'
import {
  formatDayNumber,
  formatLongDate,
  formatTime,
  formatWeekdayShort,
  toProgramDateKey,
  upperFirst,
} from '@/lib/programs/format'
import { ASSESSMENT_PRICE_RM, PROGRAM_TOTAL_SESSIONS, rm } from '@/lib/programs/catalog'
import type { CoachId, CoachSlot } from '@/lib/programs/types'

type CoachFilter = CoachId | 'any'

interface SessionBookingProps {
  /** assessment = evaluación de pago (flujo 1) · program = sesión del plan (flujo 4) */
  mode: 'assessment' | 'program'
  slots: CoachSlot[]
  coachIds: CoachId[]
  /** Solo en modo program: sesiones hechas con cada entrenador */
  sessionsByCoach?: Record<CoachId, number>
  /** Solo en modo program: la sesión que se está reservando y lo que queda */
  sessionNumber?: number
  toBookAfter?: number
}

/**
 * Selector de hueco con Dani o Denzel. El filtro de entrenador solo cambia
 * los huecos que se ven: el plan (objetivo, número de sesión, notas) es el
 * mismo y se queda fijo arriba.
 *
 * Prototipo: los huecos son de ejemplo y confirmar no llama a ninguna API.
 */
export function SessionBooking({
  mode,
  slots,
  coachIds,
  sessionsByCoach,
  sessionNumber,
  toBookAfter,
}: SessionBookingProps) {
  const [coach, setCoach] = useState<CoachFilter>('any')
  const [selected, setSelected] = useState<CoachSlot | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const visible = useMemo(
    () => (coach === 'any' ? slots : slots.filter((s) => s.coachId === coach)),
    [slots, coach]
  )

  // Días de la ventana visible, con cuántos huecos tiene cada uno.
  const days = useMemo(() => {
    const map = new Map<string, { date: Date; count: number }>()
    slots.forEach((s) => {
      const key = toProgramDateKey(new Date(s.startsAt))
      if (!map.has(key)) map.set(key, { date: new Date(s.startsAt), count: 0 })
    })
    visible.forEach((s) => {
      map.get(toProgramDateKey(new Date(s.startsAt)))!.count++
    })
    return [...map.entries()].map(([key, v]) => ({ key, ...v }))
  }, [slots, visible])

  const [dayKey, setDayKey] = useState<string | null>(null)
  const activeDay = days.find((d) => d.key === dayKey && d.count > 0) ?? days.find((d) => d.count > 0) ?? null
  const daySlots = activeDay ? visible.filter((s) => toProgramDateKey(new Date(s.startsAt)) === activeDay.key) : []

  const chooseCoach = (value: CoachFilter) => {
    setCoach(value)
    if (selected && value !== 'any' && selected.coachId !== value) setSelected(null)
  }

  // Patrón radiogroup de WAI-ARIA: un solo Tab entra al grupo (en la opción
  // marcada) y las flechas mueven y marcan a la vez.
  const coachRefs = useRef<(HTMLButtonElement | null)[]>([])
  const onCoachKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number, count: number) => {
    let next: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % count
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + count) % count
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = count - 1
    else return
    e.preventDefault()
    chooseCoach(filters[next].value)
    coachRefs.current[next]?.focus()
  }

  const filters: { value: CoachFilter; label: string; hint: string }[] = [
    { value: 'any', label: 'Cualquiera', hint: 'Más horarios' },
    ...coachIds.map((id) => ({
      value: id,
      label: SAMPLE_COACHES[id].name,
      hint:
        sessionsByCoach !== undefined
          ? `${sessionsByCoach[id]} ${sessionsByCoach[id] === 1 ? 'sesión' : 'sesiones'} contigo`
          : 'Entrenador del plan',
    })),
  ]

  const selectedCoach = selected ? SAMPLE_COACHES[selected.coachId] : null
  const selectedDate = selected ? new Date(selected.startsAt) : null
  const confirmLabel =
    mode === 'assessment' ? `Continuar · ${rm(ASSESSMENT_PRICE_RM)}` : `Confirmar sesión ${sessionNumber}`

  if (confirmed && selected && selectedCoach && selectedDate) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 sm:p-8 text-center" role="status">
        <span className="mx-auto h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <ProgramIcon name="check" size={22} />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          {mode === 'assessment' ? 'Así quedaría tu evaluación' : `Sesión ${sessionNumber} reservada (simulado)`}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {upperFirst(formatLongDate(selectedDate))} a las {formatTime(selectedDate)} con{' '}
          {selectedCoach.name}. Pista incluida.
        </p>
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
          Prototipo: no se ha {mode === 'assessment' ? 'cobrado ni reservado' : 'reservado ni descontado'} nada.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={mode === 'assessment' ? '/programa/evaluacion' : '/programa/mi-programa'}
            className="h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 flex items-center justify-center"
          >
            {mode === 'assessment' ? 'Ver el paso siguiente' : 'Volver a Mi programa'}
          </Link>
          <button
            type="button"
            onClick={() => setConfirmed(false)}
            className="h-12 px-6 rounded-xl bg-white text-gray-900 font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 transition-all duration-150"
          >
            Cambiar hora
          </button>
        </div>
      </div>
    )
  }

  return (
    // La barra fija de abajo (lg:hidden) mide hasta ~92 px. El layout solo
    // reserva sitio para ella por debajo de md; entre md y lg se añade aquí
    // para que no tape el final del resumen.
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start md:max-lg:pb-16">
      <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-4 sm:p-6 min-w-0">
        <div>
          <p id="coach-filter-label" className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Entrenador
          </p>
          <div role="radiogroup" aria-labelledby="coach-filter-label" className="mt-3 grid grid-cols-3 gap-2">
            {filters.map((f, i) => {
              const active = coach === f.value
              return (
                <button
                  key={f.value}
                  ref={(el) => {
                    coachRefs.current[i] = el
                  }}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  tabIndex={active ? 0 : -1}
                  onClick={() => chooseCoach(f.value)}
                  onKeyDown={(e) => onCoachKeyDown(e, i, filters.length)}
                  className={`min-h-14 rounded-xl px-2 sm:px-3 py-2 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                  }`}
                >
                  <span className="block text-sm font-semibold truncate">{f.label}</span>
                  <span className={`block text-[11px] truncate ${active ? 'text-white/80' : 'text-gray-500'}`}>{f.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Día</p>
          <div className="mt-3 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
            <ul className="flex gap-2 w-max pb-1">
              {days.map((d) => {
                const active = activeDay?.key === d.key
                const empty = d.count === 0
                return (
                  <li key={d.key}>
                    <button
                      type="button"
                      disabled={empty}
                      aria-pressed={active}
                      onClick={() => setDayKey(d.key)}
                      className={`w-14 h-[72px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        empty
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : active
                            ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                            : 'ring-1 ring-inset ring-gray-200 text-gray-900 hover:ring-blue-400 hover:bg-blue-50/60'
                      }`}
                    >
                      <span className={`text-[11px] uppercase ${active ? 'text-white/80' : 'text-gray-500'}`}>
                        {formatWeekdayShort(d.date)}
                      </span>
                      <span className="text-lg font-semibold tabular-nums leading-none">{formatDayNumber(d.date)}</span>
                      <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>
                        {empty ? '—' : `${d.count} ${d.count === 1 ? "libre" : "libres"}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {activeDay ? upperFirst(formatLongDate(activeDay.date)) : 'Hora'}
          </p>
          {daySlots.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No hay horarios libres en los próximos días con este filtro.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {daySlots.map((slot) => {
                const active = selected?.startsAt === slot.startsAt && selected.coachId === slot.coachId
                const c = SAMPLE_COACHES[slot.coachId]
                return (
                  <li key={`${slot.coachId}-${slot.startsAt}`}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelected(slot)}
                      className={`w-full h-14 rounded-xl px-3 flex items-center justify-between gap-2 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        active
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                          : 'ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                      }`}
                    >
                      <span className="text-sm font-semibold tabular-nums">{formatTime(new Date(slot.startsAt))}</span>
                      <span className={`text-xs truncate ${active ? 'text-white/80' : 'text-gray-500'}`}>{c.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-4 text-xs text-gray-400">Horarios de ejemplo, no es la disponibilidad real.</p>
        </div>
      </div>

      {/* Resumen: en móvil queda justo debajo y el botón se fija abajo. */}
      <aside className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 lg:sticky lg:top-6">
        <h2 className="text-lg font-semibold text-gray-900">Tu reserva</h2>
        {selected && selectedCoach && selectedDate ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-xl bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{upperFirst(formatLongDate(selectedDate))}</p>
              <p className="text-sm text-gray-600 tabular-nums">
                {formatTime(selectedDate)} · {selected.durationMinutes} min
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <CoachAvatar coach={selectedCoach} size="sm" />
              <span className="text-sm text-gray-700">con {selectedCoach.name}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">Elige un día y una hora.</p>
        )}

        <dl className="mt-5 pt-5 border-t border-gray-100 flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between gap-4 text-gray-600">
            <dt>Pista</dt>
            <dd>Incluida</dd>
          </div>
          {mode === 'program' ? (
            <>
              <div className="flex justify-between gap-4 text-gray-600">
                <dt>Se descuenta de tu plan</dt>
                <dd className="tabular-nums">1 sesión</dd>
              </div>
              <div className="flex justify-between items-baseline gap-4 pt-2.5 border-t border-gray-100">
                <dt className="font-medium text-gray-900">A pagar</dt>
                <dd className="text-2xl font-bold text-gray-900 tabular-nums">RM 0</dd>
              </div>
              {toBookAfter !== undefined && (
                <p className="text-xs text-gray-500">
                  {toBookAfter === 0 ? (
                    'Con esta, ya tendrás todas las sesiones del plan reservadas.'
                  ) : (
                    <>
                      Después te {toBookAfter === 1 ? 'quedará' : 'quedarán'}{' '}
                      <span className="tabular-nums">{toBookAfter}</span>{' '}
                      {toBookAfter === 1 ? 'sesión' : 'sesiones'} por reservar.
                    </>
                  )}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4 text-gray-600">
                <dt>Cuenta como</dt>
                <dd>Sesión 1 de {PROGRAM_TOTAL_SESSIONS}</dd>
              </div>
              <div className="flex justify-between items-baseline gap-4 pt-2.5 border-t border-gray-100">
                <dt className="font-medium text-gray-900">Total</dt>
                <dd className="text-2xl font-bold text-gray-900 tabular-nums">{rm(ASSESSMENT_PRICE_RM)}</dd>
              </div>
            </>
          )}
        </dl>

        <ConfirmButton disabled={!selected} label={confirmLabel} onClick={() => setConfirmed(true)} className="hidden lg:flex mt-6" />
      </aside>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-20 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-3">
        {selected && selectedDate && selectedCoach && (
          <p className="mb-2 text-xs text-gray-600 text-center">
            {upperFirst(formatWeekdayShort(selectedDate))} {formatDayNumber(selectedDate)} · {formatTime(selectedDate)} · {selectedCoach.name}
          </p>
        )}
        <ConfirmButton disabled={!selected} label={selected ? confirmLabel : 'Elige una hora'} onClick={() => setConfirmed(true)} className="flex" />
      </div>
    </div>
  )
}

function ConfirmButton({ disabled, label, onClick, className }: { disabled: boolean; label: string; onClick: () => void; className: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${className} w-full h-12 rounded-xl font-semibold items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        disabled
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25'
      }`}
    >
      {label}
    </button>
  )
}
