/**
 * Alias route for Mauricio Martin
 * Redirects to the full landing page
 */

import { notFound } from 'next/navigation'
import { getTrainerBySlug } from '@/lib/services/trainers-data.service'
import PremiumHero from '@/components/mauri/PremiumHero'
import SpecialtiesSection from '@/components/mauri/SpecialtiesSection'
import CoursesSection from '@/components/mauri/CoursesSection'
import BookingSection from '@/components/mauri/BookingSection'
import ReviewsSection from '@/components/mauri/ReviewsSection'
import CtaSection from '@/components/mauri/CtaSection'
import FooterSection from '@/components/mauri/FooterSection'

export async function generateMetadata() {
  return {
    title: 'Mauricio Martin - The Padel Doctor | Reserva tu sesión',
    description:
      'Técnica Clínica • Estrategia Competitiva • Mentalidad Ganadora. Reserva tu sesión con Mauricio Martin, especialista en transformar jugadores.',
  }
}

export default async function MauriPage() {
  const trainer = await getTrainerBySlug('mauri')

  if (!trainer) {
    notFound()
  }

  // Use the trainer ID from database
  const trainerId = trainer.id

  return (
    <div className="w-full">
      {/* Hero Section */}
      <PremiumHeroWrapper
        name={trainer.name}
        tagline="The Padel Doctor - Técnica Clínica & Mentalidad Ganadora"
        rating={trainer.rating || 4.9}
        reviews={trainer.total_reviews || 156}
        imageUrl={trainer.image_url || '/trainers/mauri/hero.jpg'}
      />

      {/* Specialties */}
      <SpecialtiesSection />

      {/* Courses */}
      <CoursesSection />

      {/* Booking Section */}
      <BookingSection
        trainerId={trainerId}
        trainerName={trainer.name}
        trainerPrice={99}
        trainerEmail={trainer.email}
        trainerPhone={trainer.phone}
      />

      {/* Reviews */}
      <ReviewsSection />

      {/* CTA */}
      <CtaSection />

      {/* Footer */}
      <FooterSection
        email={trainer.email || 'mauri@padeldoctor.com'}
        phone={trainer.phone || '+1234567890'}
        whatsapp={trainer.phone?.replace(/[^\d]/g, '') || '1234567890'}
        instagram="@mauridoctor"
      />
    </div>
  )
}

// Client component wrapper for PremiumHero
function PremiumHeroWrapper({
  name,
  tagline,
  rating,
  reviews,
  imageUrl,
}: {
  name: string
  tagline: string
  rating: number
  reviews: number
  imageUrl: string
}) {
  const handleBookClick = () => {
    const bookingSection = document.getElementById('booking-section')
    bookingSection?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <PremiumHero
      name={name}
      tagline={tagline}
      rating={rating}
      reviews={reviews}
      imageUrl={imageUrl}
      onBookClick={handleBookClick}
    />
  )
}
