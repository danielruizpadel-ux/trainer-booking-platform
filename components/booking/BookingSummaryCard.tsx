'use client'

import { motion } from 'framer-motion'

interface Session {
  date: string
  time: string
}

interface BookingSummaryCardProps {
  sessions: Session[]
  total: number
  discount: number
  pricePerSession?: number
}

export default function BookingSummaryCard({
  sessions,
  total,
  discount,
  pricePerSession = 300,
}: BookingSummaryCardProps) {
  const subtotal = sessions.length * pricePerSession
  const discountAmount = Math.round((subtotal * discount) / 100)

  const parseDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const formatSession = (date: string, time: string) => {
    const dateObj = parseDate(date)
    const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'short' })
    const dayNum = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    return `${dayName} ${dayNum}, ${time}`
  }

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-sm border border-gray-100/50 p-8 sticky top-32"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-2xl font-bold text-gray-900 mb-6">Resumen</h3>

      {/* Sessions List */}
      <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            Selecciona sesiones para comenzar
          </p>
        ) : (
          sessions.map((session) => (
            <div key={`${session.date}-${session.time}`} className="text-sm text-gray-700 flex justify-between">
              <span>{formatSession(session.date, session.time)}</span>
              <span className="font-medium">RM {pricePerSession}</span>
            </div>
          ))
        )}
      </div>

      {sessions.length > 0 && (
        <>
          {/* Divider */}
          <div className="border-t border-gray-200 my-4" />

          {/* Pricing */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm text-gray-700">
              <span>Subtotal ({sessions.length} sesiones)</span>
              <span>RM {subtotal}</span>
            </div>

            {discount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                <span>🎁 Descuento {discount}%</span>
                <span>-RM {discountAmount}</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
            <div className="flex justify-between items-center">
              <span className="text-gray-900 font-semibold">Total Final</span>
              <span className="text-3xl font-bold text-blue-600">RM {total}</span>
            </div>
          </div>

          {/* Discount Info */}
          {sessions.length < 5 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <p className="text-xs text-blue-700">
                Selecciona {5 - sessions.length} más para obtener 10% de descuento
              </p>
            </div>
          )}

          {sessions.length >= 5 && sessions.length < 10 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
              <p className="text-xs text-blue-700">
                Selecciona {10 - sessions.length} más para obtener 15% de descuento
              </p>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
