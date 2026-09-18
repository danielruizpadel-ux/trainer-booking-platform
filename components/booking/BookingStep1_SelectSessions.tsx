'use client'

import { useState, useEffect } from 'react'
import AvailabilityCalendar from '@/components/trainer/calendar/AvailabilityCalendar'
import BookingSummaryCard from './BookingSummaryCard'

interface Session {
  date: string
  time: string
}

type ViewType = 'month' | 'week' | 'day'

interface BookingStep1Props {
  trainerId: string
  onConfirm: (sessions: Session[]) => void
  selectedSessions: Session[]
  onSessionChange: (sessions: Session[]) => void
  currentView: ViewType
  currentDate: Date
  onViewChange: (view: ViewType) => void
  onDateChange: (date: Date) => void
}

export default function BookingStep1_SelectSessions({
  trainerId,
  onConfirm,
  selectedSessions,
  onSessionChange,
  currentView,
  currentDate,
  onViewChange,
  onDateChange,
}: BookingStep1Props) {
  const [total, setTotal] = useState(0)
  const [discount, setDiscount] = useState(0)

  useEffect(() => {
    const pricePerSession = 300
    const subtotal = selectedSessions.length * pricePerSession
    let discountPercent = 0

    if (selectedSessions.length >= 10) {
      discountPercent = 15
    } else if (selectedSessions.length >= 5) {
      discountPercent = 10
    }

    const finalTotal = subtotal - Math.round((subtotal * discountPercent) / 100)
    setTotal(finalTotal)
    setDiscount(discountPercent)
  }, [selectedSessions])

  const handleConfirmSessions = () => {
    if (selectedSessions.length === 0) {
      return
    }
    onConfirm(selectedSessions)
  }

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-3">Selecciona tus clases</h2>
          <p className="text-lg text-gray-600">
            Elige las fechas y horas que mejor se adapten a tu calendario
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT: Calendar (2/3) */}
          <div className="lg:col-span-2">
            <AvailabilityCalendar
              trainerId={trainerId}
              onDateSelect={(date, time) => {
                // Multi-select handled internally by AvailabilityCalendar
              }}
              pricePerSession={300}
              currentView={currentView}
              currentDate={currentDate}
              onViewChange={onViewChange}
              onDateChange={onDateChange}
              selectedSessions={selectedSessions}
              onSessionChange={onSessionChange}
            />
          </div>

          {/* RIGHT: Summary (1/3) */}
          <div className="space-y-4">
            <BookingSummaryCard
              sessions={selectedSessions}
              total={total}
              discount={discount}
              pricePerSession={300}
            />

            <button
              onClick={handleConfirmSessions}
              disabled={selectedSessions.length === 0}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 shadow-sm ${
                selectedSessions.length === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
              }`}
            >
              CONFIRMAR SESIONES ({selectedSessions.length})
            </button>

            {selectedSessions.length === 0 && (
              <p className="text-red-500 text-sm text-center">
                Selecciona al menos 1 sesión para continuar
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
