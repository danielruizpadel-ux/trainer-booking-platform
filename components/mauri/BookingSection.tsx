'use client'

import { motion } from 'framer-motion'
import BookingFlow from '@/components/booking/BookingFlow'

interface BookingSectionProps {
  trainerId: string
  trainerName: string
  trainerPrice?: number
  trainerEmail?: string
  trainerPhone?: string
}

export default function BookingSection({
  trainerId,
  trainerName,
  trainerPrice = 99,
  trainerEmail,
  trainerPhone,
}: BookingSectionProps) {
  return (
    <section id="booking-section" className="py-20 px-6 bg-gray-50">
      <div className="max-w-full">
        <motion.div
          className="text-center mb-16 max-w-6xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Reserva tu sesión</h2>
          <p className="text-xl text-gray-600">Selecciona múltiples fechas y horas para aprovechar nuestros descuentos</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
        >
          <BookingFlow trainerId={trainerId} trainerName={trainerName} />
        </motion.div>
      </div>
    </section>
  )
}
