'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getMonday, parseDateStr, toDateStr } from '@/lib/dateUtils'
import type { CalendarData, CalendarReservation, CalendarWindow, SlotPick } from '@/lib/reservations/calendar'
import { toMinutes, type TimeRange } from '@/lib/availability/windows'
import {
  futureBookableStarts,
  rangeState,
  reservationKindLabel,
  reservationSummary,
  startAtMinute,
  startsInRange,
} from '@/lib/reservations/calendar-slots'
import { durationLabel } from '@/lib/availability/durations'
import { formatTime } from '@/lib/reservations/format'
import { DurationPicker } from './DurationPicker'
import { DaySlotPickerDialog } from './DaySlotPickerDialog'

type Scale = 'week' | 'day'

interface ReservationsCalendarProps {
  /** 'view': solo lectura; 'select': el entrenador elige una franja libre */
  mode: 'view' | 'select'
  /** view: clic en una reserva */
  onReservationClick?: (reservationId: string) => void
  /**
   * view: clic o toque en un hueco libre → franja con la hora bajo el puntero
   * (solo inicios reservables: cabe la duración, no pisa reservas, no es
   * pasado). Con teclado, Intro sobre el tramo abre la rejilla de horas.
   */
  onCreateAt?: (pick: SlotPick) => void
  /** select: duración de la clase a colocar (60/90). Obligatoria en modo select. */
  duration?: number
  /** select: clic en una hora de inicio dentro de un tramo libre */
  onSlotSelect?: (pick: SlotPick) => void
  /** select: franja ya elegida (para resaltarla) */
  selected?: SlotPick | null
  /** YYYY-MM-DD en el que abrir; por defecto hoy */
  initialDate?: string
  /** Menos alto (dentro de un diálogo) */
  compact?: boolean
  /** Cambia cuando hay que recargar (p. ej. tras agendar) */
  refreshKey?: number
}

const HOUR_PX = 48
const MIN_HOUR = 8
const MAX_HOUR = 21
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const EMPTY: CalendarData = { windows: [], reservations: [], durations: [60], step: 60 }

interface OpenSummary {
  reservation: CalendarReservation
  anchor: HTMLElement
  /** hover: ratón encima · focus: teclado · pin: toque en móvil (se queda hasta cerrar) */
  via: 'hover' | 'focus' | 'pin'
}

interface OpenPicker {
  window: CalendarWindow
  range: TimeRange
  starts: string[]
}

/**
 * Semana (columnas = días, filas = horas) o un solo día. Modelo 007: cada
 * VENTANA del entrenador se pinta como fondo abierto con sus tramos libres
 * ("Libre"), y cada reserva como un bloque con la altura de su duración
 * (1 h = 48 px, 1 h 30 = 72 px). Donde no hay ventana, el fondo rayado
 * significa "sin abrir". Datos de GET /api/dashboard/calendar.
 *
 * Cada tramo libre es un bloque clicable (no una lista de botones
 * incrustada, que desbordaba en columnas estrechas de la vista semanal):
 * al tocarlo se abre `DaySlotPickerDialog` con una rejilla legible de
 * horas de inicio para ese tramo, calculadas con `bookableStarts` (mismo
 * cálculo que el widget público).
 *
 * En modo `select` la duración la controla el diálogo padre (prop
 * `duration`) y elegir una hora en el modal llama a `onSlotSelect`. En
 * modo `view` la duración la elige el propio entrenador con un
 * `DurationPicker` en la cabecera (si ofrece más de una). Con `onCreateAt`
 * (Resumen), un clic o toque en un tramo libre crea una clase a la hora bajo
 * el puntero, y con teclado el modal de horas deja elegir; sin él, el modal
 * es solo informativo.
 *
 * Las reglas (qué inicios son reservables, qué hora corresponde a un clic, el
 * resumen de una reserva) viven en lib/reservations/calendar-slots.ts.
 */
export function ReservationsCalendar({
  mode,
  onReservationClick,
  onCreateAt,
  duration = 60,
  onSlotSelect,
  selected = null,
  initialDate,
  compact = false,
  refreshKey = 0,
}: ReservationsCalendarProps) {
  const today = toDateStr(new Date())
  const [anchor, setAnchor] = useState<string>(initialDate ?? today)
  const [scale, setScale] = useState<Scale>('week')
  const [data, setData] = useState<CalendarData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef(new Map<string, CalendarData>())
  // Duración que el entrenador elige para FILTRAR su propio calendario en modo view.
  const [viewDuration, setViewDuration] = useState<number>(60)
  const [openPicker, setOpenPicker] = useState<OpenPicker | null>(null)
  const [summary, setSummary] = useState<OpenSummary | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)

  const showSummary = useCallback((reservation: CalendarReservation, anchor: HTMLElement, via: OpenSummary['via']) => {
    window.clearTimeout(hideTimer.current)
    setSummary({ reservation, anchor, via })
  }, [])
  // Con un pequeño margen, para poder llevar el ratón hasta la tarjeta.
  const hideSummary = useCallback((via: OpenSummary['via'], delay = 0) => {
    window.clearTimeout(hideTimer.current)
    const hide = () => setSummary((current) => (current && current.via === via ? null : current))
    if (delay > 0) hideTimer.current = window.setTimeout(hide, delay)
    else hide()
  }, [])

  // En pantallas estrechas se arranca en Día; el usuario puede cambiarlo.
  useEffect(() => {
    if (compact || window.matchMedia('(max-width: 639px)').matches) setScale('day')
  }, [compact])

  useEffect(() => {
    cache.current.clear()
  }, [refreshKey])

  const days = useMemo(() => {
    if (scale === 'day') return [anchor]
    const monday = getMonday(parseDateStr(anchor))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      return toDateStr(d)
    })
  }, [anchor, scale])

  const rangeStart = days[0]
  const rangeEnd = days[days.length - 1]

  // Al cambiar de semana/día o recargar, el resumen abierto ya no apunta a nada.
  useEffect(() => {
    setSummary(null)
  }, [rangeStart, rangeEnd, refreshKey])

  useEffect(() => {
    const key = `${rangeStart}_${rangeEnd}`
    const cached = cache.current.get(key)
    if (cached) {
      setData(cached)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard/calendar?start=${rangeStart}&end=${rangeEnd}`, { cache: 'no-store' })
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok || !json.success) throw new Error(json.error || 'No se pudo cargar el calendario')
        return json as CalendarData
      })
      .then((payload) => {
        if (cancelled) return
        cache.current.set(key, payload)
        setData(payload)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [rangeStart, rangeEnd, refreshKey])

  // Si la duración vista deja de estar entre las que ofrece el entrenador, usa la primera disponible.
  useEffect(() => {
    if (data.durations.length > 0 && !data.durations.includes(viewDuration)) {
      setViewDuration(data.durations[0])
    }
  }, [data.durations, viewDuration])

  // Rejilla horaria: de 8 a 21 salvo que haya ventanas fuera.
  const [gridStart, gridEnd] = useMemo(() => {
    let start = MIN_HOUR
    let end = MAX_HOUR
    for (const w of data.windows) {
      start = Math.min(start, Math.floor(toMinutes(w.start_time) / 60))
      end = Math.max(end, Math.ceil(toMinutes(w.end_time) / 60))
    }
    return [start, end]
  }, [data.windows])
  const hours = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i)
  const bodyHeight = hours.length * HOUR_PX

  function move(delta: number) {
    const d = parseDateStr(anchor)
    d.setDate(d.getDate() + delta * (scale === 'week' ? 7 : 1))
    setAnchor(toDateStr(d))
  }

  const windowsByDay = useMemo(() => groupBy(data.windows, (w) => w.session_date), [data.windows])
  const reservationsByDay = useMemo(() => groupBy(data.reservations, (r) => r.session_date), [data.reservations])
  // En select la duración la manda el diálogo padre; en view la elige aquí el entrenador.
  const effectiveDuration = mode === 'select' ? duration : viewDuration
  // En view, un hueco libre crea una clase si quien usa el calendario lo permite.
  const canCreate = mode === 'view' && Boolean(onCreateAt)

  return (
    <div className="flex flex-col gap-4">
      {/* Navegación */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl ring-1 ring-inset ring-gray-200 bg-white overflow-hidden">
            <NavButton label={scale === 'week' ? 'Semana anterior' : 'Día anterior'} onClick={() => move(-1)}>
              <path d="m15 18-6-6 6-6" />
            </NavButton>
            <NavButton label={scale === 'week' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => move(1)}>
              <path d="m9 18 6-6-6-6" />
            </NavButton>
          </div>
          <button
            type="button"
            onClick={() => setAnchor(today)}
            className="h-9 px-3 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            Hoy
          </button>
          <p className="text-sm font-semibold text-gray-900">{rangeLabel(days, scale)}</p>
        </div>

        <div className="flex items-center gap-2">
          {mode === 'view' && data.durations.length > 1 && (
            <DurationPicker durations={data.durations} value={viewDuration} onChange={setViewDuration} />
          )}

          {!compact && <div role="group" aria-label="Escala" className="inline-flex rounded-xl bg-gray-100 p-1">
            {(['day', 'week'] as Scale[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scale === value}
                onClick={() => setScale(value)}
                className={`h-8 px-3 rounded-lg text-sm font-medium transition-all duration-150 ${
                  scale === value ? 'bg-white text-gray-900 ring-1 ring-gray-200/70' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {value === 'day' ? 'Día' : 'Semana'}
              </button>
            ))}
          </div>}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Rejilla */}
      <div
        className={`bg-white rounded-2xl ring-1 ring-gray-200/70 overflow-hidden ${loading ? 'opacity-60' : ''} transition-opacity`}
        aria-busy={loading}
      >
        <div className={`${compact ? 'max-h-[26rem]' : 'max-h-[34rem]'} overflow-auto`}>
          <div
            className="grid min-w-0"
            style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(${scale === 'week' ? '6.5rem' : '0'}, 1fr))` }}
          >
            {/* Cabecera de días */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-100" />
            {days.map((day, i) => {
              const isToday = day === today
              const d = parseDateStr(day)
              return (
                <div key={day} className="sticky top-0 z-10 bg-white border-b border-l border-gray-100 px-2 py-2 text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                    {scale === 'week' ? DAY_NAMES[i] : DAY_NAMES[(d.getDay() + 6) % 7]}
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>{d.getDate()}</p>
                </div>
              )
            })}

            {/* Columna de horas */}
            <div className="relative" style={{ height: bodyHeight }}>
              {hours.map((h, i) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-gray-400" style={{ top: i * HOUR_PX }}>
                  {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>

            {/* Columnas de días */}
            {days.map((day) => (
              <div
                key={day}
                className="relative border-l border-gray-100"
                style={{
                  height: bodyHeight,
                  // "Sin abrir": fondo rayado; las líneas horizontales marcan las horas
                  backgroundImage: `repeating-linear-gradient(135deg, transparent 0 6px, rgba(17, 24, 39, 0.045) 6px 7px), repeating-linear-gradient(to bottom, rgba(17, 24, 39, 0.06) 0 1px, transparent 1px ${HOUR_PX}px)`,
                  backgroundColor: 'rgb(249 250 251)',
                }}
              >
                {(windowsByDay.get(day) ?? []).map((w) => (
                  <WindowBlock
                    key={w.id}
                    window={w}
                    // Todas las reservas del día, no solo las de esta ventana:
                    // si hay dos filas de disponibilidad solapadas el mismo
                    // día (huecos legacy sin depurar), una reserva en una no
                    // debe quedar invisible al calcular las horas de la otra.
                    reservations={reservationsByDay.get(day) ?? []}
                    mode={mode}
                    gridStart={gridStart}
                    duration={effectiveDuration}
                    step={data.step}
                    selected={selected}
                    canCreate={canCreate}
                    onOpenPicker={(range, starts) => setOpenPicker({ window: w, range, starts })}
                    onCreateAt={(start) => onCreateAt?.(pickOf(w, start, effectiveDuration))}
                  />
                ))}
                {(reservationsByDay.get(day) ?? []).map((r) => (
                  <ReservationBlock
                    key={r.id}
                    reservation={r}
                    mode={mode}
                    wide={scale === 'day'}
                    gridStart={gridStart}
                    pinned={summary?.via === 'pin' && summary.reservation.id === r.id}
                    onReservationClick={
                      onReservationClick &&
                      ((id) => {
                        setSummary(null)
                        onReservationClick(id)
                      })
                    }
                    onShowSummary={showSummary}
                    onHideSummary={hideSummary}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend mode={mode} canCreate={canCreate} />

      {summary && (
        <ReservationSummaryCard
          summary={summary}
          onKeep={() => window.clearTimeout(hideTimer.current)}
          onLeave={() => hideSummary('hover', 120)}
          onClose={() => setSummary(null)}
          onOpenDetail={
            onReservationClick &&
            (() => {
              const id = summary.reservation.id
              setSummary(null)
              onReservationClick(id)
            })
          }
        />
      )}

      {openPicker && (
        <DaySlotPickerDialog
          dayLabel={dayLabelOf(openPicker.window.session_date)}
          rangeLabel={`${openPicker.range.start_time} – ${openPicker.range.end_time}`}
          durationLabel={durationLabel(effectiveDuration)}
          starts={openPicker.starts}
          selectedStart={mode === 'select' ? (selected?.start_time ?? null) : null}
          interactive={mode === 'select' || canCreate}
          onSelect={(s) => {
            const pick = pickOf(openPicker.window, s, effectiveDuration)
            setOpenPicker(null)
            if (mode === 'select') onSlotSelect?.(pick)
            else onCreateAt?.(pick)
          }}
          onClose={() => setOpenPicker(null)}
        />
      )}
    </div>
  )
}

const BLOCK_BASE =
  'absolute inset-x-1 rounded-lg px-2 py-1 text-left text-xs leading-tight overflow-hidden flex flex-col items-start justify-start transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

function topOf(time: string, gridStart: number) {
  return (toMinutes(time) / 60 - gridStart) * HOUR_PX
}
function heightOf(range: TimeRange) {
  return Math.max(22, ((toMinutes(range.end_time) - toMinutes(range.start_time)) / 60) * HOUR_PX - 2)
}

/**
 * Fondo de la ventana + un bloque por cada tramo libre.
 *
 * Un tramo solo se presenta como reservable si le queda algún inicio para la
 * duración activa (cabe, no pisa reservas, no ha pasado); si no, se pinta
 * apagado como "No cabe" o "Pasado". Con `canCreate` (Resumen), un clic o
 * toque crea en la hora bajo el puntero (con el ratón se ve antes una
 * silueta de la clase); con teclado, Intro abre la rejilla de horas. Sin
 * `canCreate`, el clic abre esa rejilla (modo select y view informativo).
 */
function WindowBlock({
  window: w,
  reservations,
  mode,
  gridStart,
  duration,
  step,
  selected,
  canCreate,
  onOpenPicker,
  onCreateAt,
}: {
  window: CalendarWindow
  reservations: CalendarReservation[]
  mode: 'view' | 'select'
  gridStart: number
  duration: number
  step: 30 | 60
  selected: SlotPick | null
  canCreate: boolean
  onOpenPicker: (range: TimeRange, starts: string[]) => void
  onCreateAt: (start: string) => void
}) {
  // Inicio bajo el ratón (silueta de la clase que se crearía)
  const [ghost, setGhost] = useState<string | null>(null)
  const taken: TimeRange[] = reservations.map((r) => ({ start_time: r.start_time, end_time: r.end_time }))
  // Mismo cálculo que el widget público (rejilla desde el inicio de la ventana), sin horas pasadas.
  const starts = futureBookableStarts(w, taken, duration, step)

  return (
    <>
      {/* Fondo "abierto" de la ventana entera */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bg-white/80"
        style={{ top: topOf(w.start_time, gridStart), height: heightOf(w) + 2 }}
      />
      {w.free.map((range) => {
        const style = { top: topOf(range.start_time, gridStart) + 1, height: heightOf(range) }
        const time = `${range.start_time} – ${range.end_time}`
        const rangeStarts = startsInRange(starts, range, duration)
        const state = rangeState(w.session_date, range, rangeStarts, duration)
        if (state !== 'bookable') {
          const label = state === 'past' ? 'Pasado' : 'No cabe'
          return (
            <div
              key={range.start_time}
              style={style}
              className={`${BLOCK_BASE} bg-gray-100 text-gray-400 border border-gray-200`}
              title={`${time}: ${state === 'past' ? 'ya ha pasado' : `no cabe una clase de ${durationLabel(duration)}`}`}
            >
              <span className="block font-semibold">{label}</span>
            </div>
          )
        }
        const isChosenRange = mode === 'select' && selected?.window_id === w.id && rangeStarts.includes(selected.start_time)
        const startUnder = (event: React.MouseEvent<HTMLElement>) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const minute = toMinutes(range.start_time) + ((event.clientY - rect.top) / HOUR_PX) * 60
          return startAtMinute(rangeStarts, minute, duration, step)
        }
        return (
          <button
            key={range.start_time}
            type="button"
            style={style}
            onClick={(event) => {
              // detail 0 = teclado (Intro/Espacio): no hay puntero, se elige en la rejilla.
              if (!canCreate || event.detail === 0) {
                onOpenPicker(range, rangeStarts)
                return
              }
              const start = startUnder(event)
              setGhost(null)
              if (start) onCreateAt(start)
            }}
            onPointerMove={(event) => {
              if (!canCreate || event.pointerType !== 'mouse') return
              const start = startUnder(event)
              if (start !== ghost) setGhost(start)
            }}
            onPointerLeave={() => setGhost(null)}
            title={canCreate ? undefined : `${time}: toca para ver las horas`}
            aria-label={
              canCreate
                ? `Libre ${time}. Crear una clase de ${durationLabel(duration)}: ${rangeStarts.length} ${rangeStarts.length === 1 ? 'hora posible' : 'horas posibles'}`
                : undefined
            }
            className={`${BLOCK_BASE} gap-0.5 ${canCreate && ghost === null ? 'cursor-cell' : 'cursor-pointer'} ${
              isChosenRange
                ? 'bg-blue-600 border border-blue-600'
                : 'bg-blue-50/60 border border-dashed border-blue-300 hover:bg-blue-100/70 hover:border-blue-400'
            }`}
          >
            <span className={`block font-semibold ${isChosenRange ? 'text-white' : 'text-blue-700'}`}>
              {isChosenRange ? `Elegida: ${formatTime(selected!.start_time)}` : 'Libre'}
            </span>
            {style.height >= 34 && (
              <span className={`block w-full truncate tabular-nums ${isChosenRange ? 'text-white/90' : 'text-blue-700/80'}`}>
                {isChosenRange ? time : `${time} · ${rangeStarts.length} ${rangeStarts.length === 1 ? 'hora' : 'horas'}`}
              </span>
            )}
          </button>
        )
      })}
      {ghost && canCreate && w.free.some((range) => startsInRange(starts, range, duration).includes(ghost)) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1 z-[1] rounded-lg border-2 border-blue-600 bg-white px-2 py-1 text-xs leading-tight text-blue-700 flex flex-col items-start"
          style={{ top: topOf(ghost, gridStart) + 1, height: heightOf({ start_time: ghost, end_time: addMin(ghost, duration) }) }}
        >
          <span className="flex items-center gap-1 font-semibold">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva clase
          </span>
          <span className="tabular-nums">
            {ghost} – {addMin(ghost, duration)}
          </span>
        </div>
      )}
    </>
  )
}

const RESERVATION_TONE: Record<CalendarReservation['kind'], string> = {
  pending: 'bg-amber-50 text-amber-900 border border-amber-300',
  proposed: 'bg-amber-50 text-amber-900 border border-dashed border-amber-400',
  confirmed: 'bg-blue-600 text-white border border-blue-600',
}

/** Icono de estado (el color del bloque ya lo dice; el icono lo hace legible sin color). */
function StatusIcon({ kind }: { kind: CalendarReservation['kind'] }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {kind === 'confirmed' ? (
        <path d="M20 6 9 17l-5-5" />
      ) : kind === 'pending' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : (
        <path d="M4 9h13l-3-3M20 15H7l3 3" />
      )}
    </svg>
  )
}

/**
 * Bloque de una reserva: nombre arriba (lo primero que se busca), hora debajo
 * y estado con icono. En Día (columna ancha) va todo en dos líneas; en Semana
 * el estado baja a una tercera línea si el bloque es de 1 h 30.
 *
 * En modo view, el resumen (ReservationSummaryCard) aparece al pasar el ratón
 * o al enfocar con teclado; en táctil, el primer toque lo fija y el segundo
 * (o "Ver detalle") abre el detalle. Con ratón y teclado el clic/Intro abre
 * el detalle directamente.
 */
function ReservationBlock({
  reservation: r,
  mode,
  wide,
  gridStart,
  pinned,
  onReservationClick,
  onShowSummary,
  onHideSummary,
}: {
  reservation: CalendarReservation
  mode: 'view' | 'select'
  wide: boolean
  gridStart: number
  pinned: boolean
  onReservationClick?: (id: string) => void
  onShowSummary: (r: CalendarReservation, anchor: HTMLElement, via: OpenSummary['via']) => void
  onHideSummary: (via: OpenSummary['via'], delay?: number) => void
}) {
  const lastPointer = useRef<string | null>(null)
  const height = heightOf(r)
  const style = { top: topOf(r.start_time, gridStart) + 1, height }
  const status = reservationKindLabel(r.kind)
  const info = reservationSummary(r, dayLabelOf(r.session_date))
  const clickable = mode === 'view' && Boolean(onReservationClick)
  const classes = `${RESERVATION_TONE[r.kind]} ${
    clickable ? `cursor-pointer active:scale-[0.98] hover:ring-2 hover:ring-blue-400/60 ${pinned ? 'ring-2 ring-blue-500' : ''}` : mode === 'select' ? 'opacity-70' : ''
  }`
  const range = `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`
  const content = (
    <>
      <span className="flex w-full min-w-0 items-center gap-1">
        <StatusIcon kind={r.kind} />
        <span className="truncate font-semibold">{r.client_name}</span>
      </span>
      <span className="block w-full truncate tabular-nums opacity-85">
        {range}
        {wide && ` · ${info.duration} · ${status}`}
      </span>
      {!wide && height >= 60 && <span className="block w-full truncate opacity-85">{status}</span>}
    </>
  )

  if (!clickable) {
    return (
      <div style={style} className={`${BLOCK_BASE} ${classes}`} title={`${r.client_name} · ${range} · ${status}`}>
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      style={style}
      className={`${BLOCK_BASE} ${classes}`}
      aria-expanded={pinned || undefined}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType
      }}
      onPointerEnter={(event) => event.pointerType === 'mouse' && onShowSummary(r, event.currentTarget, 'hover')}
      onPointerLeave={(event) => event.pointerType === 'mouse' && onHideSummary('hover', 120)}
      onFocus={(event) => {
        if (event.currentTarget.matches(':focus-visible')) onShowSummary(r, event.currentTarget, 'focus')
      }}
      onBlur={() => onHideSummary('focus')}
      onClick={(event) => {
        const touch = lastPointer.current === 'touch' || lastPointer.current === 'pen'
        lastPointer.current = null
        if (touch && !pinned) {
          onShowSummary(r, event.currentTarget, 'pin')
          return
        }
        onReservationClick?.(r.id)
      }}
    >
      {content}
      {/* Para lectores de pantalla, el resumen entero siempre (la tarjeta es visual). */}
      <span className="sr-only">
        {`. ${info.when}. ${info.duration}. ${status}${info.players ? `. ${info.players}` : ''}. Ver detalle`}
      </span>
    </button>
  )
}

/**
 * Resumen flotante de una reserva: cliente, día y horario, duración, estado
 * y jugadores. Sin email, teléfono, notas ni precio. Portal con position:
 * fixed, a la derecha del bloque (a la izquierda o debajo si no cabe). Se
 * cierra con Escape, al hacer scroll o cambiar el tamaño y, fijada por
 * toque, al tocar fuera.
 */
function ReservationSummaryCard({
  summary,
  onKeep,
  onLeave,
  onClose,
  onOpenDetail,
}: {
  summary: OpenSummary
  onKeep: () => void
  onLeave: () => void
  onClose: () => void
  onOpenDetail?: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const { reservation: r, anchor, via } = summary
  const info = reservationSummary(r, dayLabelOf(r.session_date))
  const pinned = via === 'pin'

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const a = anchor.getBoundingClientRect()
    const margin = 8
    const w = card.offsetWidth
    const h = card.offsetHeight
    let left = a.right + margin
    let top = a.top
    if (left + w > window.innerWidth - margin) left = a.left - margin - w
    if (left < margin) {
      // Ni a la derecha ni a la izquierda (móvil, vista Día): debajo, o encima.
      left = Math.min(Math.max(margin, a.left), window.innerWidth - margin - w)
      top = a.bottom + 6 + h > window.innerHeight - margin ? a.top - 6 - h : a.bottom + 6
    }
    top = Math.min(Math.max(margin, top), window.innerHeight - margin - h)
    setPos({ top, left })
  }, [anchor, r.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (cardRef.current?.contains(target) || anchor.contains(target)) return
      onClose()
    }
    const onMove = () => onClose()
    document.addEventListener('keydown', onKey)
    if (pinned) document.addEventListener('pointerdown', onPointer)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [anchor, pinned, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={cardRef}
      // Con ratón/teclado es solo visual: el bloque ya lleva el mismo texto
      // para lectores de pantalla. Fijada por toque tiene un botón real.
      aria-hidden={pinned ? undefined : true}
      role={pinned ? 'group' : undefined}
      aria-label={pinned ? `Resumen de la reserva de ${info.client}` : undefined}
      onPointerEnter={(event) => event.pointerType === 'mouse' && onKeep()}
      onPointerLeave={(event) => event.pointerType === 'mouse' && !pinned && onLeave()}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className="z-40 w-64 max-w-[calc(100vw-16px)] rounded-xl bg-white p-3 text-left ring-1 ring-gray-200"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            r.kind === 'confirmed' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          <StatusIcon kind={r.kind} />
          {info.status}
        </span>
        {pinned && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar resumen"
            className="-mr-1 -mt-1 h-8 w-8 shrink-0 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-900 flex items-center justify-center"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-900 break-words">{info.client}</p>
      <p className="mt-0.5 text-sm tabular-nums text-gray-600">{info.when}</p>
      <p className="mt-0.5 text-sm text-gray-600">
        {info.duration}
        {info.players && ` · ${info.players}`}
      </p>
      {pinned && onOpenDetail ? (
        <button
          type="button"
          onClick={onOpenDetail}
          className="mt-3 h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Ver detalle
        </button>
      ) : (
        <p className="mt-2 text-xs text-gray-400">{via === 'focus' ? 'Intro para ver el detalle' : 'Clic para ver el detalle'}</p>
      )}
    </div>,
    document.body
  )
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-9 w-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors first:border-r first:border-gray-200"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  )
}

function Legend({ mode, canCreate }: { mode: 'view' | 'select'; canCreate: boolean }) {
  const items = [
    { swatch: 'bg-amber-50 border border-amber-300', label: 'Pendiente de confirmar' },
    { swatch: 'bg-amber-50 border border-dashed border-amber-400', label: 'Propuesta enviada' },
    { swatch: 'bg-blue-600', label: 'Confirmada' },
    { swatch: 'bg-blue-50/60 border border-dashed border-blue-300', label: mode === 'select' ? 'Libre (toca para elegir hora)' : canCreate ? 'Libre (toca para crear una clase)' : 'Libre (toca para ver horas)' },
    { swatch: 'bg-gray-50 border border-gray-200', label: 'Sin abrir', hatched: true },
  ]
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            className={`h-3.5 w-3.5 rounded ${item.swatch}`}
            style={item.hatched ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgba(17,24,39,0.12) 3px 4px)' } : undefined}
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function pickOf(w: CalendarWindow, start: string, duration: number): SlotPick {
  return { window_id: w.id, session_date: w.session_date, start_time: start, end_time: addMin(start, duration), duration_minutes: duration }
}

function addMin(time: string, minutes: number): string {
  const total = toMinutes(time) + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k) ?? []
    list.push(item)
    map.set(k, list)
  }
  return map
}

function rangeLabel(days: string[], scale: Scale): string {
  const first = parseDateStr(days[0])
  if (scale === 'day') {
    const label = first.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  const last = parseDateStr(days[days.length - 1])
  const sameMonth = first.getMonth() === last.getMonth()
  const a = first.toLocaleDateString('es-ES', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
  const b = last.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${a} – ${b}`.replace(/\./g, '')
}

/** "Miércoles, 23 sept" para la cabecera del DaySlotPickerDialog. */
function dayLabelOf(dateStr: string): string {
  const d = parseDateStr(dateStr)
  const label = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  return (label.charAt(0).toUpperCase() + label.slice(1)).replace(/\./g, '')
}
