'use client'

import BookingFlow from '@/components/booking/BookingFlow'

interface BookingSectionProps {
  trainerId: string
  trainerName: string
  /** Duraciones de clase que ofrece el entrenador (60/90) */
  classDurations?: number[]
  trainerPrice?: number
  trainerEmail?: string
  trainerPhone?: string
}

export default function BookingSection({ trainerId, trainerName, classDurations = [60] }: BookingSectionProps) {
  // El encabezado y el fondo interiores los aporta BookingStep1 / BookingStep2,
  // así evitamos títulos y paddings duplicados. Aquí solo ponemos la banda de
  // contraste que destaca la reserva frente al resto de la página.
  //
  // BookingStep1 pinta su propio `bg-gray-50/50` semitransparente encima, así
  // que las franjas de aire llevan ese mismo velo para que la banda quede de
  // un solo tono y no se vea una costura arriba y abajo.
  return (
    <section
      id="booking-section"
      className="scroll-mt-20 bg-blue-100 border-y border-blue-200"
    >
      <div aria-hidden className="h-6 sm:h-10 bg-gray-50/50" />
      <BookingFlow trainerId={trainerId} trainerName={trainerName} classDurations={classDurations} />
      <div aria-hidden className="h-6 sm:h-10 bg-gray-50/50" />
    </section>
  )
}
