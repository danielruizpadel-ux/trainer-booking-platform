/**
 * Dynamic Trainer Landing Page
 * Route: /:trainerSlug
 */

import { notFound } from 'next/navigation'
import { getTrainerBySlug } from '@/lib/services/trainers-data.service'
import TrainerHero from '@/components/trainer/TrainerHero'
// El MISMO widget de reserva A2 que /mauri (checkout, cuenta de jugador,
// precios del entrenador). Es genérico: todo le llega por props. El antiguo
// components/trainer/BookingSection ($99, POST con date/time) ya no se usa.
import BookingSection from '@/components/mauri/BookingSection'
import { normalizeDurations } from '@/lib/availability/durations'
import { Icon } from '@/components/ui/icon'
import { surface, text } from '@/components/ui/styles'

interface TrainerPageProps {
  params: Promise<{
    trainerSlug: string
  }>
}

export async function generateMetadata(props: TrainerPageProps) {
  const params = await props.params
  const trainer = await getTrainerBySlug(params.trainerSlug)

  if (!trainer) {
    return {
      title: 'Trainer Not Found',
    }
  }

  return {
    title: `${trainer.name} - Book Your Session`,
    description: trainer.bio || `Book a training session with ${trainer.name}`,
  }
}

export default async function TrainerPage(props: TrainerPageProps) {
  const params = await props.params
  const trainer = await getTrainerBySlug(params.trainerSlug)

  if (!trainer) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Trainer Hero Section */}
      {/* Componente cliente: solo lo que pinta, nunca el objeto entero (acabaría en el payload RSC). */}
      <TrainerHero
        trainer={{
          name: trainer.name,
          bio: trainer.bio,
          image_url: trainer.image_url,
          rating: trainer.rating,
          total_reviews: trainer.total_reviews,
          specializations: trainer.specializations,
        }}
      />

      {/* Reserva A2 con los datos de ESTE entrenador (sin valores por defecto de Mauri) */}
      <BookingSection
        trainerId={trainer.id}
        trainerName={trainer.name}
        trainerSlug={trainer.slug}
        trainerImageUrl={trainer.image_url ?? null}
        classDurations={normalizeDurations(trainer.class_durations)}
      />

      {/* Contacto del entrenador: lo enseñaba la página antigua; se conserva con la UI nueva. */}
      {(trainer.email || trainer.phone) && (
        <section className="px-4 sm:px-6 lg:px-8 py-16 sm:py-20 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className={`${surface.card} p-6 max-w-xl`}>
              <h2 className={text.eyebrow}>Get in Touch</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {trainer.email && (
                  <li>
                    <a
                      href={`mailto:${trainer.email}`}
                      className="inline-flex items-center gap-3 text-sm font-medium text-gray-700 hover:text-gray-900 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className={surface.iconTile}>
                        <Icon name="mail" />
                      </span>
                      <span className="break-all">{trainer.email}</span>
                    </a>
                  </li>
                )}
                {trainer.phone && (
                  <li>
                    <a
                      href={`tel:${trainer.phone}`}
                      className="inline-flex items-center gap-3 text-sm font-medium text-gray-700 hover:text-gray-900 tabular-nums rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className={surface.iconTile}>
                        <Icon name="phone" />
                      </span>
                      {trainer.phone}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
