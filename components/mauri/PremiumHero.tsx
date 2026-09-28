'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface PremiumHeroProps {
  name: string
  tagline: string
  rating: number
  reviews: number
  imageUrl: string
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.31l-5.8 3.05 1.1-6.46-4.69-4.58 6.49-.94L12 2.5z" />
    </svg>
  )
}

export default function PremiumHero({
  name,
  tagline,
  rating,
  reviews,
  imageUrl,
}: PremiumHeroProps) {
  const handleBookClick = () => {
    // Aterriza en el selector (duración + semana + primeras horas), no en el
    // aire de arriba de la sección. `#reserva` lleva su propio scroll-margin.
    const target = document.getElementById('reserva') ?? document.getElementById('booking-section')
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleProgramsClick = () => {
    document.getElementById('programas')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="relative min-h-dvh w-full overflow-hidden">
      {/* Background image */}
      <Image src={imageUrl} alt={name} fill className="object-cover" priority quality={85} />

      {/* Neutral overlay — lets the photo through */}
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-gray-950/40 to-gray-950/10" />

      {/* Content */}
      <div className="relative min-h-dvh flex items-center">
        <motion.div
          className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-left"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
            {name}
          </h1>

          <p className="mt-3 text-lg text-white/70 max-w-xl">{tagline}</p>

          {/* Rating */}
          <div className="mt-5 flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-amber-400">
              {[...Array(5)].map((_, i) => (
                <StarIcon key={i} />
              ))}
            </div>
            <span className="text-white font-semibold tabular-nums">{rating}</span>
            <span className="text-white/60 text-sm">({reviews} reseñas)</span>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBookClick}
              className="h-12 px-7 rounded-xl bg-white text-gray-900 font-semibold hover:bg-gray-100 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Reservar sesión
            </button>
            <button
              type="button"
              onClick={handleProgramsClick}
              className="h-12 px-6 rounded-xl font-semibold text-white ring-1 ring-inset ring-white/30 hover:bg-white/10 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              Ver programas
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
