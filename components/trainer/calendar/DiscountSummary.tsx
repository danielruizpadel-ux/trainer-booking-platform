'use client'

import { motion } from 'framer-motion'

interface Session {
  date: string
  time: string
}

interface DiscountSummaryProps {
  sessions: Session[]
  pricePerSession: number
  onConfirm: () => void
  isLoading?: boolean
}

export default function DiscountSummary({
  sessions,
  pricePerSession,
  onConfirm,
  isLoading = false,
}: DiscountSummaryProps) {
  const selectedCount = sessions.length

  const getDiscountPercentage = (count: number): number => {
    if (count >= 10) return 15
    if (count >= 5) return 10
    return 0
  }

  const discountPercentage = getDiscountPercentage(selectedCount)
  const subtotal = selectedCount * pricePerSession
  const discountAmount = Math.round((subtotal * discountPercentage) / 100)
  const total = subtotal - discountAmount

  return (
    <motion.div
      className="bg-white rounded-2xl shadow-sm border border-gray-100/50 p-8 sticky top-32 hover:shadow-md transition-shadow"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h3 className="text-2xl font-bold text-gray-900 mb-8 flex items-center gap-2">
        📊 <span>Resumen de Reserva</span>
      </h3>

      <div className="space-y-5 mb-8">
        {/* Session Count and Price */}
        <div className="flex justify-between items-center pb-5 border-b border-gray-200">
          <span className="text-gray-700 font-medium">
            {selectedCount} {selectedCount === 1 ? 'sesión' : 'sesiones'} × RM {pricePerSession}
          </span>
          <span className="font-semibold text-gray-900 text-lg">RM {subtotal}</span>
        </div>

        {/* Discount */}
        {discountPercentage > 0 && (
          <motion.div
            className="flex justify-between items-center pb-5 border-b border-gray-200"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-emerald-600 font-semibold flex items-center gap-2">
              <span>🎁</span>
              <span>Descuento {discountPercentage}%</span>
            </span>
            <span className="font-semibold text-emerald-600 text-lg">-RM {discountAmount}</span>
          </motion.div>
        )}

        {/* Discount Threshold Info */}
        {selectedCount < 5 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              Elige {5 - selectedCount} más sesión{selectedCount === 4 ? '' : 'es'} para obtener 10% de descuento
            </p>
          </div>
        )}

        {selectedCount >= 5 && selectedCount < 10 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              Elige {10 - selectedCount} más sesión{selectedCount === 9 ? '' : 'es'} para obtener 15% de descuento
            </p>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-900">Total Final</span>
          <span className="text-4xl font-bold text-blue-600">RM {total}</span>
        </div>
      </div>

      {/* Confirm Button */}
      <button
        onClick={onConfirm}
        disabled={selectedCount === 0 || isLoading}
        className={`w-full py-3 rounded-xl font-semibold text-white transition-all duration-200 shadow-sm hover:shadow-md ${
          selectedCount === 0
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
        }`}
      >
        {isLoading ? 'Procesando...' : `Confirmar ${selectedCount} ${selectedCount === 1 ? 'Sesión' : 'Sesiones'}`}
      </button>

      {/* Info */}
      <p className="text-xs text-gray-600 text-center mt-4">
        {selectedCount === 0
          ? 'Selecciona fechas y horas para comenzar'
          : `Vas a reservar ${selectedCount} sesión${selectedCount !== 1 ? 'es' : ''}`}
      </p>
    </motion.div>
  )
}
