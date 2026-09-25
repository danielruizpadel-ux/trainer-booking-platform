'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Icon } from '@/components/ui/icon'
import { button, text } from '@/components/ui/styles'

interface TrainerHeroProps {
  /** Solo campos públicos de la cabecera (ver lib/services/trainers-data.service). */
  trainer: {
    name: string
    bio?: string
    image_url?: string
    rating?: number
    total_reviews?: number
    specializations?: string[]
  }
}

/**
 * Cabecera de la página pública de un entrenador (/[trainerSlug]). Sistema de
 * diseño: único texto grande de la página es el h1; movimiento solo de entrada.
 */
export default function TrainerHero({ trainer }: TrainerHeroProps) {
  const rating = trainer.rating
  // Si la foto no carga (URL caída), el mismo hueco que cuando no hay foto.
  const [imageFailed, setImageFailed] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  // La <img> llega renderizada del servidor: si falla antes de hidratar,
  // onError ya no salta. Se comprueba al montar.
  useEffect(() => {
    const img = imageRef.current
    if (img && img.complete && img.naturalWidth === 0) setImageFailed(true)
  }, [])
  const filled = Math.floor(rating || 0)

  return (
    <section className="bg-white px-4 sm:px-6 lg:px-8 pt-10 pb-12 sm:pt-16 sm:pb-16">
      <motion.div
        className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 lg:gap-12 items-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className="order-2 lg:order-1">
          {trainer.image_url && !imageFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trainer.image_url}
              ref={imageRef}
              alt={trainer.name}
              onError={() => setImageFailed(true)}
              className="w-full aspect-square object-cover rounded-2xl ring-1 ring-gray-200/70"
            />
          ) : (
            <div
              aria-hidden
              className="w-full aspect-square max-h-[420px] rounded-2xl bg-blue-50 ring-1 ring-gray-200/70 flex items-center justify-center"
            >
              <Icon name="user" size={96} className="text-blue-600/30" />
            </div>
          )}
        </div>

        <div className="order-1 lg:order-2 min-w-0">
          <p className={text.eyebrow}>Professional Trainer</p>
          <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">{trainer.name}</h1>

          {rating !== undefined && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-0.5" role="img" aria-label={`${rating.toFixed(1)} de 5`}>
                {[...Array(5)].map((_, i) => (
                  <Icon key={i} name="star" size={16} className={i < filled ? 'text-amber-400' : 'text-gray-200'} />
                ))}
              </span>
              <span className="font-semibold text-gray-900 tabular-nums">{rating.toFixed(1)}</span>
              {trainer.total_reviews !== undefined && (
                <span className="text-sm text-gray-500 tabular-nums">
                  {trainer.total_reviews} {trainer.total_reviews === 1 ? 'review' : 'reviews'}
                </span>
              )}
            </div>
          )}

          {trainer.bio && <p className="mt-5 text-lg text-gray-500 max-w-xl">{trainer.bio}</p>}

          {trainer.specializations && trainer.specializations.length > 0 && (
            <div className="mt-6">
              <p className={text.eyebrow}>Specializations</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {trainer.specializations.map((spec) => (
                  <li key={spec} className="h-8 px-3 rounded-full bg-gray-100 text-sm font-medium text-gray-700 flex items-center">
                    {spec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <a href="#booking-section" className={`mt-8 ${button.primary}`}>
            Scroll down to book your session
            <Icon name="arrow-down" size={18} />
          </a>
        </div>
      </motion.div>
    </section>
  )
}
