'use client'

import { useMemo } from 'react'
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
  pricePerSession?: number
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
  pricePerSession = 300,
}: BookingStep1Props) {
  const { total, discount } = useMemo(() => {
    const subtotal = selectedSessions.length * pricePerSession
    const pct = selectedSessions.length >= 10 ? 15 : selectedSessions.length >= 5 ? 10 : 0
    return { total: subtotal - Math.round((subtotal * pct) / 100), discount: pct }
  }, [selectedSessions, pricePerSession])

  const handleRemove = (date: string, time: string) => {
    onSessionChange(selectedSessions.filter((s) => !(s.date === date && s.time === time)))
  }

  return (
    <section className="py-10 sm:py-14 px-4 sm:px-6 lg:px-8 bg-gray-50/50">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Selecciona tus clases
          </h2>
          <p className="mt-1.5 text-gray-500">
            Elige los días y las horas que mejor te encajen. Cuantas más reserves, mejor precio.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          {/* Calendario (incluye su propia navbar, única) */}
          <AvailabilityCalendar
            trainerId={trainerId}
            currentView={currentView}
            currentDate={currentDate}
            onViewChange={onViewChange}
            onDateChange={onDateChange}
            selectedSessions={selectedSessions}
            onSessionChange={onSessionChange}
          />

          {/* Panel lateral */}
          <BookingSummaryCard
            sessions={selectedSessions}
            total={total}
            discount={discount}
            pricePerSession={pricePerSession}
            onRemove={handleRemove}
            onConfirm={() => selectedSessions.length > 0 && onConfirm(selectedSessions)}
          />
        </div>
      </div>
    </section>
  )
}
