'use client'

/**
 * Selector "Fácil" del embudo de reserva (PROTOTIPO — proto/mauri-reserva-facil).
 *
 * Objetivo: encontrar y elegir una hora sin recorrer un mes lleno de fechas
 * pasadas. Semana compacta arriba; al elegir un día, sus horas salen DEBAJO en
 * el mismo panel (sin modal); y si el día está vacío, un botón lleva al próximo
 * día con huecos — pero SOLO cuando los datos ya cargados confirman que existe.
 *
 * No cambia reglas de negocio: usa el mismo GET /api/availability, la misma
 * hora reservable (`start_time` tal cual la da la API), el mismo solapamiento
 * (`overlapsSelection`, lib/availability/windows) y el mismo filtro de pasado
 * (`isPastMalaysiaSession`) que el calendario canónico. La selección es la
 * misma fuente de verdad (`selectedSessions` / `onSessionChange`) que comparten
 * las vistas Mes y Día, así que se pueden elegir varias clases.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { toDateStr, getMonday, isSameDay, parseDateStr, shortTime, isPastMalaysiaSession } from '@/lib/dateUtils'
import { overlapsSelection } from '@/lib/availability/windows'
import MiniCalendarOverlay from '@/components/trainer/calendar/MiniCalendarOverlay'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  end_time: string
  current_bookings: number
  max_capacity: number
}

interface Session {
  date: string
  time: string
}

interface EasyWeekSelectorProps {
  trainerId: string
  selectedSessions: Session[]
  onSessionChange: (sessions: Session[]) => void
  durationMinutes: number
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default function EasyWeekSelector({
  trainerId,
  selectedSessions,
  onSessionChange,
  durationMinutes,
}: EasyWeekSelectorProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showMiniCalendar, setShowMiniCalendar] = useState(false)
  const miniTriggerRef = useRef<HTMLButtonElement>(null)

  // Ventana cargada: desde hoy (o la semana vista, lo que sea antes) hasta 12
  // semanas por delante de la semana vista. Depende de `weekStart`, así que al
  // navegar (flechas o minicalendario) se recargan los datos del periodo nuevo;
  // el "próximo día con horas" se calcula solo sobre datos ya cargados.
  const range = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monday = getMonday(weekStart)
    const from = new Date(Math.min(today.getTime(), monday.getTime()))
    from.setDate(from.getDate() - 7)
    const to = new Date(monday)
    to.setDate(to.getDate() + 7 * 12)
    return { start: toDateStr(from), end: toDateStr(to) }
  }, [weekStart])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!trainerId) {
        setError('No se ha indicado el entrenador')
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      try {
        const url = `/api/availability?trainer_id=${trainerId}&start_date=${range.start}&end_date=${range.end}&duration=${durationMinutes}`
        const res = await fetch(url)
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !data?.success || !Array.isArray(data.data)) {
          setSlots([])
          setError(data?.error || 'No se pudo cargar la disponibilidad')
          return
        }
        setSlots(data.data)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setSlots([])
          setError(err instanceof Error ? err.message : 'No se pudo cargar la disponibilidad')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [trainerId, range.start, range.end, durationMinutes])

  // Solo huecos futuros (misma regla que el calendario).
  const visibleSlots = useMemo(
    () => slots.filter((s) => !isPastMalaysiaSession(s.session_date, s.start_time)),
    [slots]
  )
  const freeByDate = useMemo(
    () =>
      visibleSlots.reduce<Record<string, number>>((acc, s) => {
        if (s.current_bookings < s.max_capacity) acc[s.session_date] = (acc[s.session_date] || 0) + 1
        return acc
      }, {}),
    [visibleSlots]
  )
  const availableDates = useMemo(
    () => Object.keys(freeByDate).filter((d) => freeByDate[d] > 0).sort(),
    [freeByDate]
  )

  // Días que el minicalendario marca como elegibles (resaltados):
  //  - dentro de la ventana ya cargada: solo los que tienen horas libres para la
  //    duración elegida (los cargados sin horas quedan apagados, "sin huecos");
  //  - más allá de la ventana cargada: aún no se sabe, así que se dejan
  //    elegibles (nunca se pintan como día sin huecos); al elegir uno, `weekStart`
  //    cambia, se recarga ese periodo y las horas se recalculan.
  // Depende de la duración vía `availableDates`, así que las marcas se
  // actualizan al cambiar entre 1 h y 1 h 30.
  const minicalDates = useMemo(() => {
    const set = new Set(availableDates)
    const loadedEnd = parseDateStr(range.end)
    const horizon = new Date(loadedEnd)
    horizon.setDate(horizon.getDate() + 365)
    for (let x = new Date(loadedEnd); x < horizon; ) {
      x.setDate(x.getDate() + 1)
      set.add(toDateStr(x))
    }
    return set
  }, [availableDates, range.end])

  // Enfoque inicial (solo cuando aún no hay día elegido): el primer día con
  // horas de la semana visible; si no hay, salta a la semana del próximo día
  // disponible. Una vez el usuario elige un día (incluido uno sin horas desde el
  // minicalendario), no se le mueve solo.
  useEffect(() => {
    if (isLoading || selectedDay || availableDates.length === 0) return
    const weekDays = weekDates(weekStart).map(toDateStr)
    const inWeek = weekDays.find((d) => freeByDate[d])
    if (inWeek) {
      setSelectedDay(inWeek)
      return
    }
    const next = availableDates[0]
    if (next) {
      setSelectedDay(next)
      setWeekStart(getMonday(parseDateStr(next)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, selectedDay, availableDates.length])

  const classMinutes = durationMinutes || 60
  const selectedTimesForDay = (date: string) =>
    new Set(selectedSessions.filter((s) => s.date === date).map((s) => s.time))
  const sessionCountByDate = useMemo(
    () =>
      selectedSessions.reduce<Record<string, number>>((acc, s) => {
        acc[s.date] = (acc[s.date] || 0) + 1
        return acc
      }, {}),
    [selectedSessions]
  )

  const blockedBySelection = (date: string, time: string) =>
    overlapsSelection(selectedSessions, { date, time }, classMinutes)

  const toggleTime = (date: string, time: string) => {
    if (isPastMalaysiaSession(date, time)) return
    const exists = selectedSessions.some((s) => s.date === date && s.time === time)
    if (exists) {
      onSessionChange(selectedSessions.filter((s) => !(s.date === date && s.time === time)))
    } else {
      if (blockedBySelection(date, time)) return
      onSessionChange([...selectedSessions, { date, time }])
    }
  }

  // Próximo día con horas DESPUÉS del día enfocado, dentro de lo ya cargado.
  const nextAvailableAfterSelected = useMemo(() => {
    const ref = selectedDay ?? toDateStr(new Date())
    return availableDates.find((d) => d > ref) ?? null
  }, [availableDates, selectedDay])

  const goToDay = (date: string) => {
    setSelectedDay(date)
    setWeekStart(getMonday(parseDateStr(date)))
  }

  const weekDays = weekDates(weekStart)
  const today = new Date()
  const daySlots = selectedDay
    ? visibleSlots.filter((s) => s.session_date === selectedDay)
    : []

  const weekLabel = () => {
    const end = new Date(weekStart)
    end.setDate(end.getDate() + 6)
    const sameMonth = weekStart.getMonth() === end.getMonth()
    const left = weekStart.toLocaleDateString('es-ES', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
    const right = end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${left} – ${right}`
  }

  const arrowBtn =
    'h-9 w-9 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed'

  // No permitir retroceder a semanas totalmente en el pasado.
  const prevWeekAllowed = (() => {
    const prevEnd = new Date(weekStart)
    prevEnd.setDate(prevEnd.getDate() - 1)
    return prevEnd >= getMonday(today)
  })()

  return (
    <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-5 sm:p-6">
      {/* Cabecera de la semana */}
      <div className="flex items-center justify-between gap-2 pb-4 mb-4 border-b border-gray-100">
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          disabled={!prevWeekAllowed}
          className={arrowBtn}
          aria-label="Semana anterior"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="relative">
          <button
            ref={miniTriggerRef}
            type="button"
            onClick={() => setShowMiniCalendar((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={showMiniCalendar}
            aria-label="Elegir fecha"
            title="Elegir fecha"
            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-base font-semibold text-gray-900 capitalize hover:bg-gray-100 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {weekLabel()}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          {/* Ancla centrada bajo el botón: es el offsetParent del minicalendario
              y tiene su mismo ancho, así el overlay (left-0 dentro del ancla)
              queda centrado con la fecha y el icono. Su propio ajuste horizontal
              lo mantiene dentro de la pantalla en móvil. */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-[min(19rem,calc(100vw-2rem))]">
            <MiniCalendarOverlay
              isOpen={showMiniCalendar}
              onClose={() => setShowMiniCalendar(false)}
              triggerRef={miniTriggerRef}
              currentDate={selectedDay ? parseDateStr(selectedDay) : weekStart}
              availableDates={minicalDates}
              onDateSelect={(d) => {
                goToDay(toDateStr(d))
                setShowMiniCalendar(false)
              }}
            />
          </div>
        </div>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          className={arrowBtn}
          aria-label="Semana siguiente"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center">
          <div className="inline-block h-8 w-8 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
          <p className="mt-3 text-sm text-gray-500">Cargando disponibilidad…</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-gray-900 font-medium">No hay disponibilidad para este periodo</p>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
        </div>
      ) : (
        <>
          {/* Semana compacta: 7 días siempre a la vista */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {weekDays.map((date, index) => {
              const dateStr = toDateStr(date)
              const free = freeByDate[dateStr] || 0
              const hasAvailability = free > 0
              const isSelected = selectedDay === dateStr
              const isToday = isSameDay(date, today)
              const chosen = sessionCountByDate[dateStr] || 0

              return (
                <button
                  key={dateStr}
                  onClick={() => hasAvailability && setSelectedDay(dateStr)}
                  disabled={!hasAvailability}
                  aria-pressed={isSelected}
                  className={[
                    'rounded-xl py-2.5 px-1 text-center transition-all duration-150',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : hasAvailability
                      ? 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed',
                    !isSelected && isToday ? 'ring-2 ring-inset ring-blue-500' : '',
                  ].join(' ')}
                >
                  <div className={`text-[10px] font-semibold uppercase tracking-wide ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
                    {DAY_NAMES[index]}
                  </div>
                  <div className="text-lg sm:text-xl font-bold leading-tight mt-0.5">{date.getDate()}</div>
                  <div className={`mt-1 flex justify-center`}>
                    {chosen > 0 ? (
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-600'}`} aria-hidden />
                    ) : hasAvailability ? (
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-blue-200' : 'bg-emerald-500'}`} aria-hidden />
                    ) : (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-transparent" aria-hidden />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Horas del día enfocado — DEBAJO, en el mismo panel */}
          <div className="mt-6">
            {selectedDay ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold text-gray-900 capitalize">
                    {parseDateStr(selectedDay).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  {daySlots.length > 0 && (
                    <span className="text-sm text-gray-500 whitespace-nowrap">
                      {daySlots.length} hora{daySlots.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {daySlots.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-gray-500">No quedan horas libres este día.</p>
                    {nextAvailableAfterSelected && (
                      <button
                        onClick={() => goToDay(nextAvailableAfterSelected)}
                        className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      >
                        Ir al próximo día con horas
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                    {daySlots.map((slot) => {
                      const isSelected = selectedTimesForDay(selectedDay).has(slot.start_time)
                      const blocked = !isSelected && blockedBySelection(selectedDay, slot.start_time)
                      const isAvailable = slot.current_bookings < slot.max_capacity && !blocked
                      return (
                        <button
                          key={`${slot.id}:${slot.start_time}`}
                          onClick={() => isAvailable && toggleTime(selectedDay, slot.start_time)}
                          disabled={!isAvailable}
                          aria-pressed={isSelected}
                          title={blocked ? 'Se solapa con otra clase que ya has elegido' : undefined}
                          className={[
                            'py-3 rounded-xl text-sm font-medium transition-all duration-150',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                            isSelected
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : isAvailable
                              ? 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                              : 'bg-gray-50 text-gray-300 cursor-not-allowed line-through',
                          ].join(' ')}
                        >
                          {shortTime(slot.start_time)}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Acceso al próximo día aunque el actual tenga horas (por si ninguna le encaja). */}
                {daySlots.length > 0 && nextAvailableAfterSelected && (
                  <button
                    onClick={() => goToDay(nextAvailableAfterSelected)}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Ver el próximo día con horas
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                )}
              </>
            ) : (
              <div className="py-8 text-center text-sm text-gray-500">
                {availableDates.length === 0
                  ? 'No hay horas disponibles próximamente.'
                  : 'Toca un día con punto verde para ver sus horas.'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function weekDates(weekStart: Date): Date[] {
  const days: Date[] = []
  for (let i = 0; i < 7; i++) days.push(addDays(weekStart, i))
  return days
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
