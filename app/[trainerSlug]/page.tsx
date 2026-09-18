/**
 * Dynamic Trainer Landing Page
 * Route: /:trainerSlug
 */

import { notFound } from 'next/navigation'
import { getTrainerBySlug } from '@/lib/services/trainers-data.service'
import TrainerHero from '@/components/trainer/TrainerHero'
import BookingSection from '@/components/trainer/BookingSection'

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

      {/* Booking Section - Client Component */}
      <BookingSection
        trainerId={trainer.id}
        trainerName={trainer.name}
        trainerPrice={trainer.price}
        trainerEmail={trainer.email}
        trainerPhone={trainer.phone}
      />
    </div>
  )
}
