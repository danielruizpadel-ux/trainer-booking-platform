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
      <TrainerHero trainer={trainer} />

      {/* Reserva A2 con los datos de ESTE entrenador (sin valores por defecto de Mauri) */}
      <BookingSection
        trainerId={trainer.id}
        trainerName={trainer.name}
        trainerSlug={trainer.slug}
        trainerImageUrl={trainer.image_url ?? null}
        classDurations={normalizeDurations(trainer.class_durations)}
      />
    </div>
  )
}
