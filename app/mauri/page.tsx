/**
 * Mauricio Martin — The Padel Doctor
 * Landing page + booking flow
 */

import { notFound } from 'next/navigation'
import { getTrainerBySlug } from '@/lib/services/trainers-data.service'
import PremiumHero from '@/components/mauri/PremiumHero'
import SpecialtiesSection from '@/components/mauri/SpecialtiesSection'
import CoursesSection from '@/components/mauri/CoursesSection'
import BookingSection from '@/components/mauri/BookingSection'
import { normalizeDurations } from '@/lib/availability/durations'
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

  // Use the trainer slug (works with updated availability API)
  // Falls back to trainer.id if available
  const trainerId = trainer.id || 'mauri'

  return (
    <div className="w-full">
      <PremiumHero
        name={trainer.name}
        tagline="The Padel Doctor - Técnica Clínica & Mentalidad Ganadora"
        rating={trainer.rating || 4.9}
        reviews={trainer.total_reviews || 156}
        imageUrl={trainer.image_url || '/trainers/mauri/hero.jpg'}
      />

      {/* La reserva va lo primero al bajar del hero: es la accion principal. */}
      <BookingSection
        trainerId={trainerId}
        trainerName={trainer.name}
        trainerSlug={trainer.slug}
        trainerImageUrl={trainer.image_url || '/trainers/mauri/hero.jpg'}
        classDurations={normalizeDurations(trainer.class_durations)}
        trainerEmail={trainer.email}
        trainerPhone={trainer.phone}
      />

      <SpecialtiesSection />

      <CoursesSection />

      {/* Reseñas: opción A del sistema de diseño — sección retirada. Para la opción B, importa y añade <ReviewsSection /> aquí. */}

      <CtaSection />

      <FooterSection
        email={trainer.email || 'mauri@padeldoctor.com'}
        phone={trainer.phone || '+1234567890'}
        whatsapp={trainer.phone?.replace(/[^\d]/g, '') || '1234567890'}
        instagram="@mauridoctor"
      />
    </div>
  )
}
