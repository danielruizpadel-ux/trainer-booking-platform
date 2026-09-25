'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'

interface AvailabilitySlot {
  id: string
  session_date: string
  start_time: string
  current_bookings: number
  max_capacity: number
}

interface TimePickerDropdownProps {
  date: string
  slots: AvailabilitySlot[]
  selectedTimes: Set<string>
  onToggleTime: (date: string, time: string) => void
  onClose: () => void
}

export default function TimePickerDropdown({
  date,
  slots,
  selectedTimes,
  onToggleTime,
  onClose,
}: TimePickerDropdownProps) {
  const dateSlots = slots.filter((slot) => slot.session_date === date)

  // Foco (diálogo modal): al abrir va a la hora elegida o a la primera libre;
  // Escape cierra; Tab no se sale del diálogo; al cerrar vuelve al elemento
  // que lo abrió (el día del calendario).
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    onClose()
    const target = returnFocusRef.current
    if (target && target.isConnected) target.focus()
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    // Se guarda una sola vez y nunca un elemento del propio diálogo: en
    // desarrollo (StrictMode) este efecto se ejecuta dos veces y la segunda
    // vería ya el foco en una hora del diálogo.
    const active = document.activeElement
    if (
      returnFocusRef.current === null &&
      active instanceof HTMLElement &&
      active !== document.body &&
      !dialog?.contains(active)
    ) {
      returnFocusRef.current = active
    }

    const first =
      dialog?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]:not(:disabled)') ??
      dialog?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    first?.focus()
    // Solo al abrir: las horas elegidas cambian mientras está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = [...dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      if (focusables.length === 0) return
      const firstEl = focusables[0]
      const lastEl = focusables[focusables.length - 1]
      const inside = dialogRef.current.contains(document.activeElement)
      if (e.shiftKey && (document.activeElement === firstEl || !inside)) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && (document.activeElement === lastEl || !inside)) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [close])

  const parseDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const dateObj = parseDate(date)
  const dateLabel = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gray-950/40 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        ref={dialogRef}
        className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 max-w-md w-full"
        role="dialog"
        aria-modal="true"
        aria-labelledby="time-picker-title"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="time-picker-title" className="text-lg font-semibold text-gray-900 mb-4">
          Selecciona horas para {dateLabel}
        </h3>

        <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto mb-6">
          {dateSlots.map((slot) => {
            const isSelected = selectedTimes.has(slot.start_time)
            const isAvailable = slot.current_bookings < slot.max_capacity

            return (
              <button
                // slot.id es la VENTANA (migración 007): varios inicios la comparten.
                key={`${slot.id}:${slot.start_time}`}
                type="button"
                onClick={() => onToggleTime(date, slot.start_time)}
                disabled={!isAvailable}
                aria-pressed={isSelected}
                className={`h-12 rounded-xl text-sm font-semibold tabular-nums inline-flex items-center justify-center gap-1.5 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                    : isAvailable
                    ? 'bg-white text-gray-900 ring-1 ring-inset ring-gray-200 hover:ring-blue-400 hover:bg-blue-50/60'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {slot.start_time.slice(0, 5)}
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={close}
          className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Listo
        </button>
      </motion.div>
    </motion.div>
  )
}
