'use client'

import { motion } from 'framer-motion'

interface ReviewProps {
  rating: number
  name: string
  text: string
  improvement: string
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.31l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5z" />
    </svg>
  )
}

const ReviewCard = ({ rating, name, text, improvement }: ReviewProps) => (
  <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 hover:ring-gray-300 transition-all duration-150">
    <div className="flex items-center gap-0.5 text-amber-400">
      {[...Array(rating)].map((_, i) => (
        <StarIcon key={i} />
      ))}
    </div>
    <p className="mt-4 text-sm text-gray-600">{text}</p>
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-sm font-medium text-gray-900">{name}</p>
      <p className="mt-0.5 text-xs text-gray-500">{improvement}</p>
    </div>
  </div>
)

export default function ReviewsSection() {
  const reviews: ReviewProps[] = [
    {
      rating: 5,
      name: 'Juan Martínez',
      text: 'Mauri cambió completamente mi forma de jugar. Su enfoque clínico en la técnica es impresionante y los resultados hablan solos.',
      improvement: 'Subió 2 categorías en 3 meses',
    },
    {
      rating: 5,
      name: 'Sofía Rodríguez',
      text: 'La mentalidad ganadora que Mauri transmite es invaluable. No solo mejoré técnicamente, sino que ahora gano partidos que antes perdía.',
      improvement: 'Ganó 5 torneos en 6 meses',
    },
    {
      rating: 5,
      name: 'Carlos López',
      text: 'La estrategia competitiva que aprendí con Mauri es la diferencia entre ser bueno y ser ganador.',
      improvement: 'Campeón regional 2024',
    },
  ]

  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-100 border-t border-gray-200/70">
      <div className="max-w-6xl mx-auto">
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Lo que dicen mis alumnos
          </h2>
          <p className="mt-1.5 text-gray-500">Historias de transformación y éxito</p>
        </motion.header>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          {reviews.map((review) => (
            <ReviewCard key={review.name} {...review} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}

// Opción B del sistema de diseño: esta sección está rediseñada pero NO se renderiza (opción A). Para activarla, importa y añade <ReviewsSection /> en app/mauri/page.tsx.
