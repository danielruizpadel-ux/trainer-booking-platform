'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { formatSessionLabel } from '@/lib/dateUtils'

interface Session {
  date: string
  time: string
}

interface SessionSelectorProps {
  sessions: Session[]
  onRemove: (date: string, time: string) => void
}

export default function SessionSelector({ sessions, onRemove }: SessionSelectorProps) {
  if (sessions.length === 0) return null

  const sorted = [...sessions].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  )

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Sesiones seleccionadas ({sessions.length})
      </h4>
      <div className="space-y-1.5 max-h-56 overflow-y-auto -mr-1 pr-1">
        <AnimatePresence initial={false}>
          {sorted.map((session) => (
            <motion.div
              key={`${session.date}-${session.time}`}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="group flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2"
            >
              <span className="text-sm text-gray-700 truncate">
                {formatSessionLabel(session.date, session.time)}
              </span>
              <button
                onClick={() => onRemove(session.date, session.time)}
                aria-label="Quitar sesión"
                className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
