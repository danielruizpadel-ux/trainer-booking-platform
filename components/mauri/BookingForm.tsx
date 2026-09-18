'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BookingFormProps {
  trainerId: string
  trainerName: string
  selectedDate: string
  selectedTime: string
  price: number
  onSuccess: () => void
}

export default function BookingForm({
  trainerId,
  trainerName,
  selectedDate,
  selectedTime,
  price,
  onSuccess,
}: BookingFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    whatsapp: false,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error'
    message: string
  }>({ type: 'idle', message: '' })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_id: trainerId,
          client_name: formData.name,
          client_email: formData.email,
          client_phone: formData.phone,
          date: selectedDate,
          time: selectedTime,
          notes: formData.whatsapp ? 'Desea tips vía WhatsApp' : '',
        }),
      })

      if (response.ok) {
        setStatus({
          type: 'success',
          message: '¡Reserva confirmada! Recibirás confirmación por email.',
        })
        setFormData({ name: '', email: '', phone: '', whatsapp: false })
        onSuccess()
      } else {
        setStatus({
          type: 'error',
          message: 'Error al confirmar la reserva. Intenta nuevamente.',
        })
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: 'Error de conexión. Intenta más tarde.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      className="bg-white rounded-xl shadow-lg p-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Summary */}
      <div className="mb-8 pb-6 border-b border-gray-200">
        <p className="text-sm text-gray-600 mb-2">Sesión de 1 hora</p>
        <p className="text-3xl font-bold text-blue-600">${price}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Nombre completo *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none transition-colors"
            placeholder="Tu nombre"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Email *
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none transition-colors"
            placeholder="tu@email.com"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Teléfono *
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-blue-600 focus:outline-none transition-colors"
            placeholder="+1 (555) 123-4567"
          />
        </div>

        {/* WhatsApp Checkbox */}
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="whatsapp"
            checked={formData.whatsapp}
            onChange={handleChange}
            className="w-5 h-5 text-blue-600 rounded border-gray-300 cursor-pointer"
          />
          <span className="text-sm text-gray-700">
            Deseo recibir tips vía WhatsApp
          </span>
        </label>

        {/* Submit Button */}
        <motion.button
          type="submit"
          disabled={isSubmitting || !selectedDate || !selectedTime}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`w-full py-4 rounded-lg font-bold text-white text-lg transition-all ${
            isSubmitting || !selectedDate || !selectedTime
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center gap-2">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                ⏳
              </motion.div>
              Procesando...
            </div>
          ) : (
            'Confirmar reserva'
          )}
        </motion.button>

        {/* Status Messages */}
        <AnimatePresence>
          {status.type === 'success' && (
            <motion.div
              className="bg-green-50 border-2 border-green-300 rounded-lg p-4 text-green-700 font-semibold"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              ✅ {status.message}
            </motion.div>
          )}
          {status.type === 'error' && (
            <motion.div
              className="bg-red-50 border-2 border-red-300 rounded-lg p-4 text-red-700 font-semibold"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              ❌ {status.message}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <p className="text-xs text-gray-600 text-center mt-6">
        Selecciona fecha y hora arriba para confirmar tu reserva
      </p>
    </motion.div>
  )
}
