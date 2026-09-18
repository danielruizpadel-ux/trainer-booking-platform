'use client'

import { motion, AnimatePresence } from 'framer-motion'

interface Session {
  date: string
  time: string
}

interface SessionSelectorProps {
  sessions: Session[]
  onRemove: (date: string, time: string) => void
}

export default function SessionSelector({ sessions, onRemove }: SessionSelectorProps) {
  const parseDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const formatSession = (date: string, time: string) => {
    const dateObj = parseDate(date)
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' })
    const day = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day}, ${time}`
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">Selecciona fechas y horas para agregar sesiones</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-gray-900 text-sm">Sesiones Seleccionadas ({sessions.length})</h4>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        <AnimatePresence>
          {sessions.map((session, index) => (
            <motion.div
              key={`${session.date}-${session.time}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-3 hover:bg-blue-100 transition-colors"
            >
              <span className="text-sm text-gray-900 font-medium">
                {formatSession(session.date, session.time)}
              </span>
              <button
                onClick={() => onRemove(session.date, session.time)}
                className="text-gray-400 hover:text-red-600 transition-colors"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
