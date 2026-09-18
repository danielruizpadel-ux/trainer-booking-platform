/**
 * Mauricio Martin - The Padel Doctor Landing Page
 */

'use client'

import { useState, useRef } from 'react'
import PremiumHero from '@/components/mauri/PremiumHero'
import SpecialtiesSection from '@/components/mauri/SpecialtiesSection'
import CoursesSection from '@/components/mauri/CoursesSection'
import CalendlyCalendar from '@/components/mauri/CalendlyCalendar'
import BookingForm from '@/components/mauri/BookingForm'
import ReviewsSection from '@/components/mauri/ReviewsSection'
import CtaSection from '@/components/mauri/CtaSection'
import FooterSection from '@/components/mauri/FooterSection'

const TRAINER_ID = 'mauri' // Will be replaced with actual ID from DB
const TRAINER_NAME = 'Mauricio Martin'
const PRICE = 99
const RATING = 4.9
const REVIEWS = 156

export default function MauriPage() {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const bookingRef = useRef<HTMLDivElement>(null)

  const handleBookClick = () => {
    bookingRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleDateSelect = (date: string, time: string) => {
    setSelectedDate(date)
    setSelectedTime(time)
  }

  const handleBookingSuccess = () => {
    setSelectedDate('')
    setSelectedTime('')
  }

  return (
    <>
      {/* Hero Section */}
      <PremiumHero
        name={TRAINER_NAME}
        tagline="The Padel Doctor - Técnica Clínica & Mentalidad Ganadora"
        rating={RATING}
        reviews={REVIEWS}
        imageUrl="/trainers/mauri/hero.jpg"
        onBookClick={handleBookClick}
      />

      {/* Specialties */}
      <SpecialtiesSection />

      {/* Courses */}
      <CoursesSection />

      {/* Booking Section */}
      <section
        ref={bookingRef}
        className="py-20 px-6 bg-gray-50"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-16 text-center">
            Reserva tu sesión
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Calendar (2 columns on desktop) */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-lg p-8">
                <CalendlyCalendar
                  trainerId={TRAINER_ID}
                  onDateSelect={handleDateSelect}
                />
              </div>
            </div>

            {/* Booking Form (1 column) */}
            <div>
              <BookingForm
                trainerId={TRAINER_ID}
                trainerName={TRAINER_NAME}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                price={PRICE}
                onSuccess={handleBookingSuccess}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <ReviewsSection />

      {/* CTA */}
      <CtaSection onBookClick={handleBookClick} />

      {/* Footer */}
      <FooterSection
        email="mauri@padeldoctor.com"
        phone="+1234567890"
        whatsapp="1234567890"
        instagram="@mauridoctor"
      />
    </>
  )
}
