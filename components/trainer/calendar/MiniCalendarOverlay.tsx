'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { mondayFirstIndex, toDateStr } from '@/lib/dateUtils'

interface MiniCalendarOverlayProps {
  isOpen: boolean
  onClose: () => void
  currentDate: Date
  onDateSelect: (date: Date) => void
  availableDates?: Set<string>
  /** Botón que lo abre: se excluye del "clic fuera" y recibe el foco al cerrar. */
  triggerRef?: RefObject<HTMLElement | null>
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const WEEKDAYS: [string, string][] = [
  ['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'],
  ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo'],
]

/**
 * Selector de fecha en un desplegable NO modal (role="dialog" sin
 * aria-modal): se cierra al hacer clic fuera o al salir con Tab, así que no
 * atrapa el foco.
 *
 * - Al abrir, el foco va al día actual (o al primer día con disponibilidad).
 * - Tab: Mes anterior → Mes siguiente → rejilla de días (un solo día en el
 *   orden de Tab) → fuera, y al salir se cierra.
 * - En la rejilla: flechas (±1 día / ±1 semana), Inicio/Fin (primer/último
 *   día disponible), RePág/AvPág (mes anterior/siguiente).
 * - Escape cierra; Escape o elegir un día devuelven el foco al botón que lo
 *   abrió. Cambiar de mes aquí NO mueve el calendario grande: solo elegir día.
 */
export default function MiniCalendarOverlay({
  isOpen,
  onClose,
  currentDate,
  onDateSelect,
  availableDates,
  triggerRef,
}: MiniCalendarOverlayProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const hintId = useId()

  // Mes que se enseña en el desplegable (independiente del calendario grande).
  const [view, setView] = useState(() => ({ year: currentDate.getFullYear(), month: currentDate.getMonth() }))
  // Día con tabIndex=0 en la rejilla (roving tabindex).
  const [activeDay, setActiveDay] = useState<number | null>(null)
  // Tras cambiar de mes con el teclado, mover el foco al día activo del mes nuevo.
  const pendingFocus = useRef(false)

  const { year, month } = view
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = mondayFirstIndex(new Date(year, month, 1))

  const isAvailable = useCallback(
    (day: number) => !availableDates || availableDates.has(toDateStr(new Date(year, month, day))),
    [availableDates, year, month]
  )
  const availableDays = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(isAvailable)

  /** Día que debe recibir el foco en el mes que se ve. */
  const preferredDay = useCallback(() => {
    const sameMonth = currentDate.getFullYear() === year && currentDate.getMonth() === month
    if (sameMonth && isAvailable(currentDate.getDate())) return currentDate.getDate()
    const first = Array.from({ length: daysInMonth }, (_, i) => i + 1).find(isAvailable)
    return first ?? null
  }, [currentDate, year, month, daysInMonth, isAvailable])

  const focusDay = (day: number | null) => {
    const root = popoverRef.current
    if (!root) return
    const target =
      day !== null
        ? root.querySelector<HTMLButtonElement>(`button[data-day="${day}"]`)
        : root.querySelector<HTMLButtonElement>('button[data-nav="next"]')
    target?.focus()
  }

  const returnFocus = () => triggerRef?.current?.focus()

  // Al abrir: el mes del calendario grande y el foco dentro.
  useEffect(() => {
    if (!isOpen) return
    setView({ year: currentDate.getFullYear(), month: currentDate.getMonth() })
    pendingFocus.current = true
    // Solo al abrir; los cambios de currentDate mientras está abierto no lo recolocan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Cada vez que cambia el mes visible, recolocar el día activo (y el foco si toca).
  useEffect(() => {
    if (!isOpen) return
    const day = preferredDay()
    setActiveDay(day)
    if (pendingFocus.current) {
      pendingFocus.current = false
      // Tras pintar el mes nuevo.
      queueMicrotask(() => focusDay(day))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, year, month])

  // Clic fuera (sin contar el botón que lo abre) y Escape.
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef?.current?.contains(target)) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        returnFocus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, onClose])

  const changeMonth = (delta: number, moveFocus = false) => {
    pendingFocus.current = moveFocus
    setView(({ year: y, month: m }) => {
      const d = new Date(y, m + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const selectDay = (day: number) => {
    if (!isAvailable(day)) return
    onDateSelect(new Date(year, month, day))
    onClose()
    returnFocus()
  }

  // Salir con Tab (o con el foco a cualquier sitio de fuera) cierra el desplegable, sin robar el foco.
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null
    if (!next) return // clic en zona no enfocable: lo gestiona el "clic fuera"
    if (popoverRef.current?.contains(next)) return
    if (triggerRef?.current?.contains(next)) return
    onClose()
  }

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (activeDay === null) return
    const step = (from: number, delta: number): number | null => {
      let d = from + delta
      while (d >= 1 && d <= daysInMonth) {
        if (isAvailable(d)) return d
        d += delta > 0 ? 1 : -1
      }
      return null
    }
    let next: number | null | undefined
    switch (event.key) {
      case 'ArrowRight': next = step(activeDay, 1); break
      case 'ArrowLeft': next = step(activeDay, -1); break
      case 'ArrowDown': next = step(activeDay, 7); break
      case 'ArrowUp': next = step(activeDay, -7); break
      case 'Home': next = availableDays[0] ?? null; break
      case 'End': next = availableDays[availableDays.length - 1] ?? null; break
      case 'PageUp': event.preventDefault(); changeMonth(-1, true); return
      case 'PageDown': event.preventDefault(); changeMonth(1, true); return
      default: return
    }
    event.preventDefault()
    if (next != null) {
      setActiveDay(next)
      focusDay(next)
    }
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const navButton =
    'h-8 w-8 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={hintId}
          onBlur={handleBlur}
          className="absolute top-full left-0 mt-2 z-50 w-[19rem] max-w-[calc(100vw-2rem)] bg-white rounded-2xl ring-1 ring-gray-200 p-4 overflow-visible"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          <p id={hintId} className="sr-only">
            Ir a una fecha. Usa las flechas para moverte entre días, Re Pág y Av Pág para cambiar de mes y Escape para cerrar.
          </p>

          <div className="flex items-center justify-between gap-2 mb-3">
            <button type="button" data-nav="prev" onClick={() => changeMonth(-1)} aria-label="Mes anterior" className={navButton}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h3 id={titleId} className="font-semibold text-gray-900 text-sm" aria-live="polite">
              {MONTH_NAMES[month]} {year}
            </h3>
            <button type="button" data-nav="next" onClick={() => changeMonth(1)} aria-label="Mes siguiente" className={navButton}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
            {WEEKDAYS.map(([short, full]) => (
              <abbr key={short} title={full} className="no-underline text-center text-xs font-bold text-gray-500 w-8 h-6 flex items-center justify-center">
                {short}
              </abbr>
            ))}
          </div>

          <div
            role="group"
            aria-label={`Días de ${MONTH_NAMES[month].toLowerCase()} de ${year}`}
            className="grid grid-cols-7 gap-1"
            onKeyDown={handleGridKeyDown}
          >
            {cells.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} className="w-8 h-8" />

              const date = new Date(year, month, day)
              const available = isAvailable(day)
              const isSelected =
                currentDate.getDate() === day && currentDate.getMonth() === month && currentDate.getFullYear() === year

              return (
            <button
                  key={day}
                  type="button"
                  data-day={day}
                  onClick={() => selectDay(day)}
                  onFocus={() => setActiveDay(day)}
                  disabled={!available}
                  tabIndex={day === activeDay ? 0 : -1}
                  aria-label={`${date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${available ? '' : ', sin disponibilidad'}`}
                  aria-current={isSelected ? 'date' : undefined}
                  className={`w-9 h-9 text-xs rounded-lg transition-all flex items-center justify-center tabular-nums focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSelected
                      ? 'bg-blue-600 text-white font-bold'
                      : available
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
