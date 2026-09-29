/**
 * Mauricio Martin — The Padel Doctor
 * Landing page + booking flow
 */

import { notFound } from 'next/navigation'
import { getTrainerBySlug } from '@/lib/services/trainers-data.service'
import PremiumHero from '@/components/mauri/PremiumHero'
import BookingSection from '@/components/mauri/BookingSection'
import { normalizeDurations } from '@/lib/availability/durations'
import FooterSection from '@/components/mauri/FooterSection'

export async function generateMetadata() {
  return {
    title: 'Mauricio Martin | Reserva tu sesión de pádel',
    description:
      'Consulta la disponibilidad semanal y solicita una sesión privada de pádel con Mauricio Martin.',
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

      <section className="bg-[#f8f5ed] px-4 py-14 text-[#252824] sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 border-t border-[#c8c4b7] pt-9 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#66675f]">
            La sesión
          </p>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Pádel, a tu ritmo.
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-[#5e6059]">
              Escoge una duración y una hora disponible en el calendario. Verás
              los detalles antes de enviar tu solicitud.
            </p>
            <a
              href="#reserva"
              className="mt-6 inline-block border-b border-[#252824] pb-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#252824]"
            >
              Volver a la agenda ↗
            </a>
          </div>
        </div>
      </section>

      <FooterSection />
    </div>
  )
}
