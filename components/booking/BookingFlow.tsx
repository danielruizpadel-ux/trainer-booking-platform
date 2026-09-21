'use client'

import { useState } from 'react'
import BookingStep1_SelectSessions from './BookingStep1_SelectSessions'
import BookingStep2_ContactForm from './BookingStep2_ContactForm'
import { calculateBookingPrice } from '@/lib/reservations/pricing'

type ViewType = 'month' | 'week' | 'day'

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

interface BookingFlowProps {
  trainerId: string
  trainerName: string
  /** Duraciones de clase que ofrece el entrenador (60/90); la primera es la inicial */
  classDurations?: number[]
}

export default function BookingFlow({ trainerId, trainerName, classDurations = [60] }: BookingFlowProps) {
  const [step, setStep] = useState<'selection' | 'contact'>('selection')
  const [selectedSessions, setSelectedSessions] = useState<Session[]>([])
  const [duration, setDuration] = useState<number>(classDurations[0] ?? 60)
  const [totalPrice, setTotalPrice] = useState(0)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [currentView, setCurrentView] = useState<ViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  const handleConfirmSessions = (sessions: Session[]) => {
    setSelectedSessions(sessions)

    // Totales: la misma regla que el servidor (lib/reservations/pricing.ts),
    // solo informativa; el precio real lo fija POST /api/reservations.
    const price = calculateBookingPrice(sessions.length, duration)
    setTotalPrice(price.total)
    setDiscountPercent(price.discountPercent)
    setStep('contact')
  }

  const handleBack = () => {
    setStep('selection')
  }

  const handleConfirmReservation = async (formData: ContactFormData) => {
    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainer_id: trainerId,
          sessions: selectedSessions,
          duration_minutes: duration,
          client_name: formData.name,
          client_email: formData.email,
          client_phone: formData.phone,
          client_whatsapp_opt_in: formData.whatsapp,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al crear reserva')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Error al crear reserva')
      }

      console.log('Solicitud de reserva registrada (pendiente de confirmar):', data.reservationIds)
      // Success - component will handle showing confirmation
    } catch (error) {
      console.error('❌ Error:', error)
      throw error
    }
  }

  return (
    <div className="w-full">
      {/* La navbar del calendario vive dentro de AvailabilityCalendar (una sola) */}
      {step === 'selection' && (
        <BookingStep1_SelectSessions
          trainerId={trainerId}
          duration={duration}
          classDurations={classDurations}
          onDurationChange={(value) => {
            // Las horas libres dependen de la duración: se vacía la selección.
            setDuration(value)
            setSelectedSessions([])
          }}
          selectedSessions={selectedSessions}
          onSessionChange={setSelectedSessions}
          onConfirm={handleConfirmSessions}
          currentView={currentView}
          currentDate={currentDate}
          onViewChange={setCurrentView}
          onDateChange={setCurrentDate}
        />
      )}

      {step === 'contact' && (
        <BookingStep2_ContactForm
          selectedSessions={selectedSessions}
          totalPrice={totalPrice}
          discountPercent={discountPercent}
          durationMinutes={duration}
          trainerId={trainerId}
          onBack={handleBack}
          onSubmit={handleConfirmReservation}
        />
      )}
    </div>
  )
}
