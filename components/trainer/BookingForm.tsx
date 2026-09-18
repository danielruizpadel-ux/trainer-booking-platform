'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface BookingFormProps {
  trainerId: string
  trainerName: string
  selectedDate: string
  selectedTime: string
  onBookingSuccess?: () => void
}

interface FormData {
  client_name: string
  client_email: string
  client_phone?: string
  date: string
  time: string
  notes?: string
}

interface FormErrors {
  [key: string]: string
}

export default function BookingForm({
  trainerId,
  trainerName,
  selectedDate: propsSelectedDate,
  selectedTime: propsSelectedTime,
  onBookingSuccess,
}: BookingFormProps) {
  const [formData, setFormData] = useState<FormData>({
    client_name: '',
    client_email: '',
    client_phone: '',
    date: '',
    time: '',
    notes: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.client_name.trim()) {
      newErrors.client_name = 'Name is required'
    }

    if (!formData.client_email.trim()) {
      newErrors.client_email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.client_email)) {
      newErrors.client_email = 'Invalid email address'
    }

    if (!propsSelectedDate) {
      newErrors.date = 'Please select a date'
    }

    if (!propsSelectedTime) {
      newErrors.time = 'Please select a time'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setSubmitStatus(null)

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainer_id: trainerId,
          client_name: formData.client_name,
          client_email: formData.client_email,
          client_phone: formData.client_phone || null,
          date: propsSelectedDate,
          time: propsSelectedTime,
          notes: formData.notes || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create reservation')
      }

      await response.json()

      setSubmitStatus({
        type: 'success',
        message: `Booking confirmed! A confirmation email has been sent to ${formData.client_email}. Your session with ${trainerName} is scheduled for ${new Date(propsSelectedDate).toLocaleDateString()} at ${propsSelectedTime}.`,
      })

      setFormData({
        client_name: '',
        client_email: '',
        client_phone: '',
        date: '',
        time: '',
        notes: '',
      })

      onBookingSuccess?.()
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const formVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
  }

  const inputVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  }

  return (
    <motion.form onSubmit={handleSubmit} className="space-y-6" variants={formVariants} initial="hidden" animate="visible">
      {/* Name */}
      <motion.div variants={inputVariants}>
        <label htmlFor="client_name" className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
          Your Name *
        </label>
        <motion.input
          type="text"
          id="client_name"
          name="client_name"
          value={formData.client_name}
          onChange={handleInputChange}
          whileFocus={{ scale: 1.01, boxShadow: '0 0 0 3px rgba(6, 182, 212, 0.1)' }}
          className={`w-full px-5 py-4 rounded-xl border-2 text-base transition-all font-medium ${
            errors.client_name
              ? 'border-red-400 bg-red-50 text-slate-900'
              : 'border-cyan-300 bg-white text-slate-900 focus:border-cyan-600'
          }`}
          placeholder="John Doe"
          disabled={isSubmitting}
        />
        <AnimatePresence>
          {errors.client_name && (
            <motion.p className="text-red-600 text-sm mt-2 font-semibold flex items-center gap-2" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
              ⚠️ {errors.client_name}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Email */}
      <motion.div variants={inputVariants}>
        <label htmlFor="client_email" className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
          Email *
        </label>
        <motion.input
          type="email"
          id="client_email"
          name="client_email"
          value={formData.client_email}
          onChange={handleInputChange}
          whileFocus={{ scale: 1.01, boxShadow: '0 0 0 3px rgba(6, 182, 212, 0.1)' }}
          className={`w-full px-5 py-4 rounded-xl border-2 text-base transition-all font-medium ${
            errors.client_email
              ? 'border-red-400 bg-red-50 text-slate-900'
              : 'border-cyan-300 bg-white text-slate-900 focus:border-cyan-600'
          }`}
          placeholder="john@example.com"
          disabled={isSubmitting}
        />
        <AnimatePresence>
          {errors.client_email && (
            <motion.p className="text-red-600 text-sm mt-2 font-semibold flex items-center gap-2" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
              ⚠️ {errors.client_email}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Phone */}
      <motion.div variants={inputVariants}>
        <label htmlFor="client_phone" className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
          Phone (Optional)
        </label>
        <motion.input
          type="tel"
          id="client_phone"
          name="client_phone"
          value={formData.client_phone}
          onChange={handleInputChange}
          whileFocus={{ scale: 1.01, boxShadow: '0 0 0 3px rgba(6, 182, 212, 0.1)' }}
          className="w-full px-5 py-4 rounded-xl border-2 border-cyan-300 bg-white text-slate-900 text-base focus:border-cyan-600 transition-all font-medium"
          placeholder="+1 (555) 123-4567"
          disabled={isSubmitting}
        />
      </motion.div>

      {/* Selected Date/Time */}
      <AnimatePresence>
        {propsSelectedDate && propsSelectedTime && (
          <motion.div
            className="bg-gradient-to-r from-cyan-50 to-blue-50 rounded-2xl p-5 border-2 border-cyan-300 shadow-md"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            <p className="text-sm text-slate-600 font-bold uppercase tracking-wide mb-2">✅ Selected Session</p>
            <p className="text-lg font-bold text-slate-900">
              {new Date(propsSelectedDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}{' '}
              <span className="text-cyan-600">at {propsSelectedTime}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date/Time Error */}
      <AnimatePresence>
        {(errors.date || errors.time) && (
          <motion.div
            className="rounded-xl border-2 border-red-400 bg-red-50 p-5 flex gap-3"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <p className="text-red-700 font-semibold">{errors.date || errors.time}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes */}
      <motion.div variants={inputVariants}>
        <label htmlFor="notes" className="block text-sm font-bold text-slate-900 mb-2 uppercase tracking-wide">
          Notes (Optional)
        </label>
        <motion.textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          whileFocus={{ scale: 1.01, boxShadow: '0 0 0 3px rgba(6, 182, 212, 0.1)' }}
          className="w-full px-5 py-4 rounded-xl border-2 border-cyan-300 bg-white text-slate-900 text-base focus:border-cyan-600 transition-all font-medium resize-none"
          placeholder="Any special requests or notes for your trainer?"
          rows={4}
          disabled={isSubmitting}
        />
      </motion.div>

      {/* Submit Status */}
      <AnimatePresence>
        {submitStatus && (
          <motion.div
            className={`rounded-2xl p-6 border-2 flex gap-3 ${
              submitStatus.type === 'success'
                ? 'bg-green-50 border-green-400'
                : 'bg-red-50 border-red-400'
            }`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
            <span className="text-3xl flex-shrink-0">
              {submitStatus.type === 'success' ? '✅' : '⚠️'}
            </span>
            <p className={`text-base font-semibold leading-relaxed ${submitStatus.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
              {submitStatus.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit Button */}
      <motion.div variants={inputVariants} className="pt-4">
        <motion.button
          type="submit"
          disabled={isSubmitting || !propsSelectedDate || !propsSelectedTime}
          whileHover={!isSubmitting && propsSelectedDate && propsSelectedTime ? { scale: 1.02, y: -2 } : {}}
          whileTap={!isSubmitting && propsSelectedDate && propsSelectedTime ? { scale: 0.98 } : {}}
          className={`w-full py-5 px-6 rounded-xl font-bold text-xl transition-all flex items-center justify-center gap-2 shadow-md ${
            isSubmitting || !propsSelectedDate || !propsSelectedTime
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed opacity-60'
              : 'bg-cyan-600 text-white hover:bg-cyan-700 hover:shadow-lg'
          }`}
        >
          {isSubmitting && (
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity }}>
              ⏳
            </motion.span>
          )}
          {isSubmitting ? 'Booking...' : `Book with ${trainerName}`}
        </motion.button>
      </motion.div>

      {/* Help Text */}
      <motion.p className="text-center text-slate-600 text-sm font-medium" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        Select your preferred date and time above, then complete this form to confirm.
      </motion.p>
    </motion.form>
  )
}
