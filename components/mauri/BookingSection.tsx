'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import CalendlyCalendar from './CalendlyCalendar'
import BookingForm from './BookingForm'

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
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')

  const handleDateSelect = (date: string, time: string) => {
    setSelectedDate(date)
    setSelectedTime(time)
  }

  const handleBookingSuccess = () => {
    setSelectedDate('')
    setSelectedTime('')
  }

  return (
    <section
      id="booking-section"
      className="py-20 px-6 bg-gray-50"
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Reserva tu sesión
          </h2>
          <p className="text-xl text-gray-600">
            Elige tu fecha y hora preferida
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Calendar (2 columns on desktop) */}
          <div className="lg:col-span-2">
            <motion.div
              className="bg-white rounded-xl shadow-lg p-8"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <CalendlyCalendar
                trainerId={trainerId}
                onDateSelect={handleDateSelect}
              />
            </motion.div>
          </div>

          {/* Booking Form (1 column) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <BookingForm
              trainerId={trainerId}
              trainerName={trainerName}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              price={trainerPrice}
              onSuccess={handleBookingSuccess}
            />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
