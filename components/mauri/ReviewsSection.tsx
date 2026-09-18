'use client'

import { motion } from 'framer-motion'

interface ReviewProps {
  rating: number
  name: string
  text: string
  improvement: string
}

const ReviewCard = ({ rating, name, text, improvement }: ReviewProps) => (
  <motion.div
    className="bg-white rounded-lg p-8 shadow-md border-l-4 border-blue-600"
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    viewport={{ once: true }}
  >
    <div className="flex gap-1 mb-4">
      {[...Array(rating)].map((_, i) => (
        <span key={i} className="text-lg">
          ⭐
        </span>
      ))}
    </div>
    <p className="text-gray-700 mb-4 leading-relaxed italic">"{text}"</p>
    <div className="border-t pt-4">
      <p className="font-semibold text-gray-900 mb-1">{name}</p>
      <p className="text-sm text-blue-600 font-medium">{improvement}</p>
    </div>
  </motion.div>
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
      text: 'La estrategia competitiva que aprendí con Mauri es la diferencia entre ser bueno y ser ganador. Altamente recomendado.',
      improvement: 'Campeón regional 2024',
    },
    {
      rating: 5,
      name: 'María González',
      text: 'Cada sesión con Mauri es una clase magistral. Su paciencia y conocimiento hacen que todo sea posible.',
      improvement: 'Mejoró consistencia 40%',
    },
    {
      rating: 5,
      name: 'Roberto Díaz',
      text: 'No puedo creer la diferencia en mi juego en solo 2 meses. Mauri es realmente "The Padel Doctor".',
      improvement: 'Ranking top 10 nacional',
    },
    {
      rating: 5,
      name: 'Andrea Sánchez',
      text: 'La combinación de técnica, estrategia y mentalidad que Mauri ofrece es única. Es una inversión que siempre vale la pena.',
      improvement: 'Profesional full-time',
    },
  ]

  return (
    <section className="py-20 px-6 bg-blue-50">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Lo que dicen mis alumnos
          </h2>
          <p className="text-xl text-gray-600">
            Historias de transformación y éxito
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {reviews.map((review) => (
            <ReviewCard key={review.name} {...review} />
          ))}
        </div>
      </div>
    </section>
  )
}
