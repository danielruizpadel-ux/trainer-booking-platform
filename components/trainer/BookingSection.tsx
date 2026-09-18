'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import AvailabilityCalendar from './AvailabilityCalendar'
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
  trainerPrice,
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
  }

  const cardVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: 'easeOut' },
    },
  }

  return (
    <div className="bg-white">
      {/* Divider */}
      <div className="max-w-7xl mx-auto px-6">
        <div className="border-t border-cyan-200/40"></div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-20 lg:py-24">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-3 gap-12"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Left Column - Calendar & About */}
          <div className="lg:col-span-2 space-y-12">
            {/* About Section */}
            <motion.div variants={cardVariants} className="space-y-6">
              <h2 className="text-4xl font-bold text-slate-900">About Me</h2>
              <p className="text-xl text-slate-700 leading-relaxed max-w-2xl">
                Professional fitness trainer with years of experience in helping clients achieve their goals through personalized training programs and guidance. Specialized in strength training, HIIT, and nutrition coaching.
              </p>
            </motion.div>

            {/* Calendar Section */}
            <motion.div variants={cardVariants} className="space-y-8">
              <h2 className="text-4xl font-bold text-slate-900">Book Your Session</h2>
              <div className="bg-slate-50 rounded-3xl p-10 border-2 border-cyan-100">
                <AvailabilityCalendar trainerId={trainerId} onDateSelect={handleDateSelect} />
              </div>
            </motion.div>
          </div>

          {/* Right Column - Booking Form & Price */}
          <motion.div variants={cardVariants} className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Price Card */}
              <motion.div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-3xl p-8 text-white shadow-lg" whileHover={{ scale: 1.02 }}>
                <p className="text-sm font-bold uppercase tracking-widest opacity-90">Session Price</p>
                <div className="mt-4">
                  <div className="text-5xl font-bold">${trainerPrice || '99'}</div>
                  <p className="text-sm font-semibold mt-2 opacity-90">per session</p>
                </div>
              </motion.div>

              {/* Booking Form Card */}
              <motion.div className="bg-white rounded-3xl p-8 border-2 border-cyan-100 shadow-sm" whileHover={{ boxShadow: '0 20px 40px rgba(6, 182, 212, 0.15)' }}>
                <h3 className="text-2xl font-bold text-slate-900 mb-6">Complete Your Booking</h3>
                <BookingForm
                  trainerId={trainerId}
                  trainerName={trainerName}
                  selectedDate={selectedDate}
                  selectedTime={selectedTime}
                  onBookingSuccess={handleBookingSuccess}
                />
              </motion.div>

              {/* Contact Info */}
              {(trainerEmail || trainerPhone) && (
                <motion.div
                  className="bg-slate-50 rounded-3xl p-8 border-2 border-slate-200 space-y-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <h4 className="text-lg font-bold text-slate-900 uppercase tracking-wide">Get in Touch</h4>
                  <div className="space-y-3">
                    {trainerEmail && (
                      <motion.a
                        href={`mailto:${trainerEmail}`}
                        className="flex items-center gap-3 text-slate-700 hover:text-cyan-600 transition-colors group"
                        whileHover={{ x: 4 }}
                      >
                        <span className="text-2xl">📧</span>
                        <span className="font-semibold group-hover:underline">{trainerEmail}</span>
                      </motion.a>
                    )}
                    {trainerPhone && (
                      <motion.a
                        href={`tel:${trainerPhone}`}
                        className="flex items-center gap-3 text-slate-700 hover:text-cyan-600 transition-colors group"
                        whileHover={{ x: 4 }}
                      >
                        <span className="text-2xl">📱</span>
                        <span className="font-semibold group-hover:underline">{trainerPhone}</span>
                      </motion.a>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
