'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface PremiumHeroProps {
  name: string
  tagline: string
  rating: number
  reviews: number
  imageUrl: string
  onBookClick: () => void
}

export default function PremiumHero({
  name,
  tagline,
  rating,
  reviews,
  imageUrl,
  onBookClick,
}: PremiumHeroProps) {
  return (
    <motion.section
      className="relative h-screen w-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Background Image */}
      <Image
        src={imageUrl}
        alt={name}
        fill
        className="object-cover"
        priority
        quality={85}
      />

      {/* Gradient Overlay - Blue to Transparent */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-600/50 to-transparent"></div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <motion.div
          className="text-center max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          {/* Name */}
          <h1 className="text-6xl md:text-7xl font-bold text-white mb-4 leading-tight">
            {name}
          </h1>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-white/90 mb-8 font-medium">
            {tagline}
          </p>

          {/* Rating */}
          <motion.div
            className="flex items-center justify-center gap-3 mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-2xl">
                  ⭐
                </span>
              ))}
            </div>
            <div className="text-white">
              <span className="text-2xl font-bold">{rating}</span>
              <span className="text-lg ml-2">({reviews} reviews)</span>
            </div>
          </motion.div>

          {/* CTA Button */}
          <motion.button
            onClick={onBookClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-white text-blue-600 px-12 py-4 rounded-lg font-bold text-xl shadow-2xl hover:shadow-blue-600/50 transition-all duration-300"
          >
            Reservar Sesión
          </motion.button>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="text-white text-center">
          <p className="text-sm mb-2">Scroll para más</p>
          <div className="text-2xl">↓</div>
        </div>
      </motion.div>
    </motion.section>
  )
}
