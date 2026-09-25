'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getMonday, isPastMalaysiaSession, parseDateStr, toDateStr } from '@/lib/dateUtils'
import type { CalendarData, CalendarReservation, CalendarWindow, SlotPick } from '@/lib/reservations/calendar'
import { bookableStarts, toMinutes, type TimeRange } from '@/lib/availability/windows'
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
 * `DurationPicker` en la cabecera (si ofrece más de una), y el modal es
 * solo informativo: sirve para ver, filtrando por duración, qué horas
 * quedarían libres.
 */
export function ReservationsCalendar({
  mode,
  onReservationClick,
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
                    onOpenPicker={(range, starts) => setOpenPicker({ window: w, range, starts })}
                  />
                ))}
                {(reservationsByDay.get(day) ?? []).map((r) => (
                  <ReservationBlock key={r.id} reservation={r} mode={mode} gridStart={gridStart} onReservationClick={onReservationClick} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend mode={mode} />

      {openPicker && (
        <DaySlotPickerDialog
          dayLabel={dayLabelOf(openPicker.window.session_date)}
          rangeLabel={`${openPicker.range.start_time} – ${openPicker.range.end_time}`}
          durationLabel={durationLabel(effectiveDuration)}
          starts={openPicker.starts}
          selectedStart={mode === 'select' ? (selected?.start_time ?? null) : null}
          interactive={mode === 'select'}
          onSelect={(s) => {
            onSlotSelect?.({
              window_id: openPicker.window.id,
              session_date: openPicker.window.session_date,
              start_time: s,
              end_time: addMin(s, effectiveDuration),
              duration_minutes: effectiveDuration,
            })
            setOpenPicker(null)
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

/** Fondo de la ventana + un bloque clicable por cada tramo libre (abre DaySlotPickerDialog). */
function WindowBlock({
  window: w,
  reservations,
  mode,
  gridStart,
  duration,
  step,
  selected,
  onOpenPicker,
}: {
  window: CalendarWindow
  reservations: CalendarReservation[]
  mode: 'view' | 'select'
  gridStart: number
  duration: number
  step: 30 | 60
  selected: SlotPick | null
  onOpenPicker: (range: TimeRange, starts: string[]) => void
}) {
  const taken: TimeRange[] = reservations.map((r) => ({ start_time: r.start_time, end_time: r.end_time }))
  // Mismo cálculo que el widget público: rejilla desde el inicio de la ventana.
  const starts = bookableStarts(w, taken, duration, step).filter(
    (start) => mode !== 'select' || !isPastMalaysiaSession(w.session_date, start)
  )

  return (
    <>
      {/* Fondo "abierto" de la ventana entera */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bg-white/80"
        style={{ top: topOf(w.start_time, gridStart), height: heightOf(w) + 2 }}
      />
      {w.free.map((range) => {
        // Cabe una clase de la duración activa (select: la del diálogo padre; view: la elegida arriba).
        const long = toMinutes(range.end_time) - toMinutes(range.start_time) >= duration
        const style = { top: topOf(range.start_time, gridStart) + 1, height: heightOf(range) }
        const time = `${range.start_time} – ${range.end_time}`
        if (!long) {
          return (
            <div key={range.start_time} style={style} className={`${BLOCK_BASE} bg-gray-100 text-gray-400 border border-gray-200`} title={`${time}: no cabe una clase`}>
              <span className="block font-semibold">No cabe</span>
            </div>
          )
        }
        const rangeStarts = starts.filter((s) => toMinutes(s) >= toMinutes(range.start_time) && toMinutes(s) + duration <= toMinutes(range.end_time))
        const isChosenRange = mode === 'select' && selected?.window_id === w.id && rangeStarts.includes(selected.start_time)
        return (
          <button
            key={range.start_time}
            type="button"
            style={style}
            onClick={() => onOpenPicker(range, rangeStarts)}
            title={`${time}: toca para ver las horas`}
            className={`${BLOCK_BASE} gap-0.5 cursor-pointer ${
              isChosenRange
                ? 'bg-blue-600 border border-blue-600'
                : 'bg-blue-50/60 border border-dashed border-blue-300 hover:bg-blue-100/70 hover:border-blue-400'
            }`}
          >
            <span className={`block font-semibold ${isChosenRange ? 'text-white' : 'text-blue-700'}`}>
              {isChosenRange ? `Elegida: ${formatTime(selected!.start_time)}` : 'Libre'}
            </span>
            {style.height >= 34 && (
              <span className={`block tabular-nums ${isChosenRange ? 'text-white/90' : 'text-blue-700/80'}`}>
                {isChosenRange ? time : `${time} · ${rangeStarts.length} ${rangeStarts.length === 1 ? 'hora' : 'horas'}`}
              </span>
            )}
          </button>
        )
      })}
    </>
  )
}

function ReservationBlock({
  reservation: r,
  mode,
  gridStart,
  onReservationClick,
}: {
  reservation: CalendarReservation
  mode: 'view' | 'select'
  gridStart: number
  onReservationClick?: (id: string) => void
}) {
  const height = heightOf(r)
  const style = { top: topOf(r.start_time, gridStart) + 1, height }
  const tone = {
    pending: 'bg-amber-50 text-amber-800 border border-amber-300',
    proposed: 'bg-amber-50 text-amber-800 border border-dashed border-amber-400',
    confirmed: 'bg-blue-600 text-white border border-blue-600',
  }[r.kind]
  const label = r.kind === 'pending' ? 'Pendiente' : r.kind === 'proposed' ? 'Propuesta' : 'Confirmada'
  const clickable = mode === 'view' && Boolean(onReservationClick)
  const classes = `${tone} ${clickable ? 'hover:ring-2 hover:ring-blue-400/60 cursor-pointer active:scale-[0.98]' : mode === 'select' ? 'opacity-70' : ''}`
  const content = (
    <>
      <span className="block tabular-nums opacity-80">
        {formatTime(r.start_time)} – {formatTime(r.end_time)} · {durationLabel(r.duration_minutes)}
      </span>
      <span className="block font-semibold truncate w-full">{r.client_name}</span>
      {height >= 60 && <span className="block opacity-80">{label}</span>}
    </>
  )
  return clickable ? (
    <button type="button" style={style} className={`${BLOCK_BASE} ${classes}`} onClick={() => onReservationClick?.(r.id)} title={`${r.client_name} · ${label}. Ver detalle`}>
      {content}
    </button>
  ) : (
    <div style={style} className={`${BLOCK_BASE} ${classes}`}>
      {content}
    </div>
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

function Legend({ mode }: { mode: 'view' | 'select' }) {
  const items = [
    { swatch: 'bg-amber-50 border border-amber-300', label: 'Pendiente de confirmar' },
    { swatch: 'bg-amber-50 border border-dashed border-amber-400', label: 'Propuesta enviada' },
    { swatch: 'bg-blue-600', label: 'Confirmada' },
    { swatch: 'bg-blue-50/60 border border-dashed border-blue-300', label: mode === 'select' ? 'Libre (toca para elegir hora)' : 'Libre (toca para ver horas)' },
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
