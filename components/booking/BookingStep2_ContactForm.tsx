'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface Session {
  date: string
  time: string
}

interface ContactFormData {
  name: string
  email: string
  phone: string
  whatsapp: boolean
}

interface FormErrors {
  name: string
  email: string
  phone: string
}

interface BookingStep2Props {
  selectedSessions: Session[]
  totalPrice: number
  discountPercent: number
  trainerId: string
  onSubmit: (data: ContactFormData) => Promise<void>
  onBack: () => void
}

export default function BookingStep2_ContactForm({
  selectedSessions,
  totalPrice,
  discountPercent,
  trainerId,
  onSubmit,
  onBack,
}: BookingStep2Props) {
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    phone: '',
    whatsapp: false,
  })

  const [formErrors, setFormErrors] = useState<FormErrors>({
    name: '',
    email: '',
    phone: '',
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

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

  const validateField = (field: keyof ContactFormData, value: string) => {
    const errors = { ...formErrors }

    if (field === 'name') {
      if (value.trim().length < 3) {
        errors.name = 'Mínimo 3 caracteres'
      } else {
        errors.name = ''
      }
    }

    if (field === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(value)) {
        errors.email = 'Email inválido'
      } else {
        errors.email = ''
      }
    }

    if (field === 'phone') {
      const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/
      if (!phoneRegex.test(value.replace(/\s/g, ''))) {
        errors.phone = 'Teléfono inválido (mínimo 10 dígitos)'
      } else {
        errors.phone = ''
      }
    }

    setFormErrors(errors)
  }

  const handleFieldChange = (field: keyof ContactFormData, value: string | boolean) => {
    setFormData({ ...formData, [field]: value })
    if (field !== 'whatsapp') {
      validateField(field, value as string)
    }
  }

  const isFormValid = () => {
    return (
      formData.name.trim().length >= 3 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
      /^[\d\s\-\+\(\)]{10,}$/.test(formData.phone.replace(/\s/g, ''))
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid()) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      await onSubmit(formData)
      setSubmitSuccess(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Error al crear reserva')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitSuccess) {
    return (
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <motion.div
          className="max-w-2xl mx-auto text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-6xl mb-4">✨</div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">¡Reserva confirmada!</h2>
          <p className="text-xl text-gray-600 mb-8">
            Te enviaremos un email con los detalles de tu reserva y los próximos pasos
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <p className="text-gray-700 font-medium">
              {selectedSessions.length} {selectedSessions.length === 1 ? 'sesión' : 'sesiones'} confirmadas
            </p>
            <p className="text-2xl font-bold text-blue-600 mt-2">RM {totalPrice}</p>
          </div>
        </motion.div>
      </section>
    )
  }

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-2xl mx-auto">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="mb-8 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
        >
          ← Volver atrás
        </button>

        <div className="mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-3">Completa tus datos</h2>
          <p className="text-lg text-gray-600">
            Necesitamos esta información para confirmar tu reserva
          </p>
        </div>

        {/* Session Summary */}
        <motion.div
          className="bg-gray-50 p-6 rounded-lg mb-8 border border-gray-200"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tus sesiones seleccionadas</h3>
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {selectedSessions.map((session) => (
              <div key={`${session.date}-${session.time}`} className="text-sm text-gray-700">
                📅 {formatSession(session.date, session.time)}
              </div>
            ))}
          </div>
          <div className="border-t border-gray-300 pt-4">
            <div className="flex justify-between items-center text-lg font-semibold text-gray-900">
              <span>Total:</span>
              <span>RM {totalPrice}</span>
            </div>
            {discountPercent > 0 && (
              <div className="text-sm text-emerald-600 mt-2">
                🎁 Incluye {discountPercent}% de descuento
              </div>
            )}
          </div>
        </motion.div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nombre */}
          <div>
            <label htmlFor="name" className="block font-semibold text-gray-900 mb-2">
              Nombre completo *
            </label>
            <input
              id="name"
              type="text"
              placeholder="Tu nombre"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                formErrors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {formErrors.name && <p className="text-red-500 text-sm mt-2">{formErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block font-semibold text-gray-900 mb-2">
              Email *
            </label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={formData.email}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                formErrors.email ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {formErrors.email && <p className="text-red-500 text-sm mt-2">{formErrors.email}</p>}
          </div>

          {/* Teléfono */}
          <div>
            <label htmlFor="phone" className="block font-semibold text-gray-900 mb-2">
              Teléfono *
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={formData.phone}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                formErrors.phone ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {formErrors.phone && <p className="text-red-500 text-sm mt-2">{formErrors.phone}</p>}
          </div>

          {/* WhatsApp Opt-in */}
          <div className="flex items-center">
            <input
              id="whatsapp"
              type="checkbox"
              checked={formData.whatsapp}
              onChange={(e) => handleFieldChange('whatsapp', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="whatsapp" className="ml-3 text-gray-700">
              Deseo recibir tips vía WhatsApp
            </label>
          </div>

          {/* Error Message */}
          {submitError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-medium">Error: {submitError}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50 transition-colors"
            >
              Volver atrás
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid()}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200 ${
                isSubmitting || !isFormValid()
                  ? 'bg-gray-400 cursor-not-allowed opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
              }`}
            >
              {isSubmitting ? 'Confirmando...' : 'CONFIRMAR RESERVA'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
