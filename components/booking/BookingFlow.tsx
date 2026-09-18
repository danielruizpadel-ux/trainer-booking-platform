'use client'

import { useState } from 'react'
import BookingStep1_SelectSessions from './BookingStep1_SelectSessions'
import BookingStep2_ContactForm from './BookingStep2_ContactForm'

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
}

export default function BookingFlow({ trainerId, trainerName }: BookingFlowProps) {
  const [step, setStep] = useState<'selection' | 'contact'>('selection')
  const [selectedSessions, setSelectedSessions] = useState<Session[]>([])
  const [totalPrice, setTotalPrice] = useState(0)
  const [discountPercent, setDiscountPercent] = useState(0)

  const handleConfirmSessions = (sessions: Session[]) => {
    setSelectedSessions(sessions)

    // Calculate totals
    const pricePerSession = 300
    const subtotal = sessions.length * pricePerSession
    let discount = 0

    if (sessions.length >= 10) {
      discount = 15
    } else if (sessions.length >= 5) {
      discount = 10
    }

    const finalTotal = subtotal - Math.round((subtotal * discount) / 100)

    setTotalPrice(finalTotal)
    setDiscountPercent(discount)
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

      console.log('✅ Reserva confirmada:', data.reservationIds)
      // Success - component will handle showing confirmation
    } catch (error) {
      console.error('❌ Error:', error)
      throw error
    }
  }

  return (
    <div className="w-full">
      {step === 'selection' && (
        <BookingStep1_SelectSessions
          trainerId={trainerId}
          selectedSessions={selectedSessions}
          onSessionChange={setSelectedSessions}
          onConfirm={handleConfirmSessions}
        />
      )}

      {step === 'contact' && (
        <BookingStep2_ContactForm
          selectedSessions={selectedSessions}
          totalPrice={totalPrice}
          discountPercent={discountPercent}
          trainerId={trainerId}
          onBack={handleBack}
          onSubmit={handleConfirmReservation}
        />
      )}
    </div>
  )
}
