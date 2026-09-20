'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getMonday, parseDateStr, toDateStr } from '@/lib/dateUtils'
import type { CalendarSlot, CalendarSlotKind } from '@/lib/reservations/calendar'
import { formatTime } from '@/lib/reservations/format'

type Scale = 'week' | 'day'

interface ReservationsCalendarProps {
  /** 'view': solo lectura; 'select': el entrenador elige un hueco libre */
  mode: 'view' | 'select'
  /** view: clic en una reserva */
  onReservationClick?: (reservationId: string) => void
  /** select: clic en un hueco libre */
  onSlotSelect?: (slot: CalendarSlot) => void
  selectedSlotId?: string | null
  /** YYYY-MM-DD en el que abrir; por defecto hoy */
  initialDate?: string
  /** Menos alto (dentro de un diálogo) */
  compact?: boolean
}

const HOUR_PX = 48
const MIN_HOUR = 8
const MAX_HOUR = 21
const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * Semana (columnas = días, filas = horas) o un solo día. Cada hueco del
 * entrenador se pinta como bloque según su estado; donde no hay hueco, el
 * fondo rayado significa "sin abrir". Los datos vienen de
 * GET /api/dashboard/calendar, que ya filtra por el entrenador de la sesión.
 */
export function ReservationsCalendar({
  mode,
  onReservationClick,
  onSlotSelect,
  selectedSlotId = null,
  initialDate,
  compact = false,
}: ReservationsCalendarProps) {
  const today = toDateStr(new Date())
  const [anchor, setAnchor] = useState<string>(initialDate ?? today)
  const [scale, setScale] = useState<Scale>('week')
  const [slots, setSlots] = useState<CalendarSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cache = useRef(new Map<string, CalendarSlot[]>())

  // En pantallas estrechas se arranca en Día; el usuario puede cambiarlo.
  useEffect(() => {
    if (window.matchMedia('(max-width: 639px)').matches) setScale('day')
  }, [])

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
      setSlots(cached)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/dashboard/calendar?start=${rangeStart}&end=${rangeEnd}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok || !data.success) throw new Error(data.error || 'No se pudo cargar el calendario')
        return data.slots as CalendarSlot[]
      })
      .then((list) => {
        if (cancelled) return
        cache.current.set(key, list)
        setSlots(list)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Error'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [rangeStart, rangeEnd])

  // Rejilla horaria: de 8 a 21 salvo que haya huecos fuera.
  const [gridStart, gridEnd] = useMemo(() => {
    let start = MIN_HOUR
    let end = MAX_HOUR
    for (const s of slots) {
      start = Math.min(start, Math.floor(toHours(s.start_time)))
      end = Math.max(end, Math.ceil(toHours(s.end_time)))
    }
    return [start, end]
  }, [slots])
  const hours = Array.from({ length: gridEnd - gridStart }, (_, i) => gridStart + i)
  const bodyHeight = hours.length * HOUR_PX

  function move(delta: number) {
    const d = parseDateStr(anchor)
    d.setDate(d.getDate() + delta * (scale === 'week' ? 7 : 1))
    setAnchor(toDateStr(d))
  }

  const slotsByDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>()
    for (const s of slots) {
      const list = map.get(s.session_date) ?? []
      list.push(s)
      map.set(s.session_date, list)
    }
    return map
  }, [slots])

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

        <div role="group" aria-label="Escala" className="inline-flex rounded-xl bg-gray-100 p-1">
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
                <div
                  key={day}
                  className="sticky top-0 z-10 bg-white border-b border-l border-gray-100 px-2 py-2 text-center"
                >
                  <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                    {scale === 'week' ? DAY_NAMES[i] : DAY_NAMES[(d.getDay() + 6) % 7]}
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${isToday ? 'text-blue-600' : 'text-gray-900'}`}>
                    {d.getDate()}
                  </p>
                </div>
              )
            })}

            {/* Columna de horas */}
            <div className="relative" style={{ height: bodyHeight }}>
              {hours.map((h, i) => (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-gray-400"
                  style={{ top: i * HOUR_PX }}
                >
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
                {(slotsByDay.get(day) ?? []).map((slot) => (
                  <SlotBlock
                    key={slot.id}
                    slot={slot}
                    mode={mode}
                    gridStart={gridStart}
                    selected={slot.id === selectedSlotId}
                    onReservationClick={onReservationClick}
                    onSlotSelect={onSlotSelect}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Legend mode={mode} />
    </div>
  )
}

function SlotBlock({
  slot,
  mode,
  gridStart,
  selected,
  onReservationClick,
  onSlotSelect,
}: {
  slot: CalendarSlot
  mode: 'view' | 'select'
  gridStart: number
  selected: boolean
  onReservationClick?: (id: string) => void
  onSlotSelect?: (slot: CalendarSlot) => void
}) {
  const top = (toHours(slot.start_time) - gridStart) * HOUR_PX
  const height = Math.max(22, (toHours(slot.end_time) - toHours(slot.start_time)) * HOUR_PX - 2)
  const showTime = height >= 40
  const style = { top: top + 1, height }
  const base =
    'absolute inset-x-1 rounded-lg px-2 py-1 text-left text-xs leading-tight overflow-hidden flex flex-col items-start justify-start transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
  const time = `${formatTime(slot.start_time)} – ${formatTime(slot.end_time)}`

  if (slot.kind === 'available') {
    const selectable = mode === 'select'
    const classes = selected
      ? 'bg-blue-600 text-white border border-blue-600 shadow-sm shadow-blue-600/25'
      : `bg-blue-50/60 text-blue-700 border border-dashed border-blue-300 ${
          selectable ? 'hover:bg-blue-100 hover:border-blue-500 cursor-pointer active:scale-[0.98]' : ''
        }`
    const content = (
      <>
        {showTime && <span className="block tabular-nums opacity-80">{time}</span>}
        <span className="block font-semibold">{selected ? 'Elegido' : 'Libre'}</span>
      </>
    )
    return selectable ? (
      <button type="button" style={style} className={`${base} ${classes}`} onClick={() => onSlotSelect?.(slot)} aria-pressed={selected}>
        {content}
      </button>
    ) : (
      <div style={style} className={`${base} ${classes}`}>
        {content}
      </div>
    )
  }

  if (slot.kind === 'closed') {
    return (
      <div style={style} className={`${base} bg-gray-100 text-gray-400 border border-gray-200`}>
        {showTime && <span className="block tabular-nums">{time}</span>}
        <span className="block font-semibold">No disponible</span>
      </div>
    )
  }

  const tone: Record<Exclude<CalendarSlotKind, 'available' | 'closed'>, string> = {
    pending: 'bg-amber-50 text-amber-800 border border-amber-300',
    proposed: 'bg-amber-50 text-amber-800 border border-dashed border-amber-400',
    confirmed: 'bg-blue-600 text-white border border-blue-600',
  }
  const label = slot.kind === 'pending' ? 'Pendiente' : slot.kind === 'proposed' ? 'Propuesta' : 'Confirmada'
  const clickable = mode === 'view' && Boolean(onReservationClick && slot.reservation)
  const classes = `${tone[slot.kind]} ${clickable ? 'hover:ring-2 hover:ring-blue-400/60 cursor-pointer active:scale-[0.98]' : mode === 'select' ? 'opacity-60' : ''}`
  const content = (
    <>
      {showTime && <span className="block tabular-nums opacity-80">{time}</span>}
      <span className="block font-semibold truncate">{slot.reservation?.client_name ?? label}</span>
      {height >= 56 && <span className="block opacity-80">{label}</span>}
    </>
  )
  return clickable ? (
    <button
      type="button"
      style={style}
      className={`${base} ${classes}`}
      onClick={() => slot.reservation && onReservationClick?.(slot.reservation.id)}
      title={`${slot.reservation?.client_name} · ${label}. Ver en la tabla`}
    >
      {content}
    </button>
  ) : (
    <div style={style} className={`${base} ${classes}`}>
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
    { swatch: 'bg-blue-50/60 border border-dashed border-blue-300', label: mode === 'select' ? 'Libre (elige uno)' : 'Libre' },
    { swatch: 'bg-gray-50 border border-gray-200', label: 'Sin abrir', hatched: true },
  ]
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            className={`h-3.5 w-3.5 rounded ${item.swatch}`}
            style={
              item.hatched
                ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 3px, rgba(17,24,39,0.12) 3px 4px)' }
                : undefined
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function toHours(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h + (m || 0) / 60
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
