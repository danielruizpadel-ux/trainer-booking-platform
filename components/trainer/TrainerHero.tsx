'use client'

import { motion } from 'framer-motion'

interface TrainerHeroProps {
  trainer: {
    id: string
    name: string
    bio?: string
    image_url?: string
    rating?: number
    total_reviews?: number
    specializations?: string[]
  }
}

export default function TrainerHero({ trainer }: TrainerHeroProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 },
    },
  }

  const imageVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.8, ease: 'easeOut' },
    },
  }

  const contentVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: 'easeOut' },
    },
  }

  return (
    <motion.div
      className="relative bg-gradient-to-b from-white via-white to-slate-50/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Foto GRANDE y prominente */}
          <motion.div className="order-2 lg:order-1" variants={imageVariants}>
            <div className="relative">
              {trainer.image_url ? (
                <motion.img
                  src={trainer.image_url}
                  alt={trainer.name}
                  className="w-full h-auto rounded-3xl shadow-2xl object-cover aspect-square"
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.3 }}
                />
              ) : (
                <div className="w-full aspect-square rounded-3xl bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center shadow-lg border-4 border-cyan-200">
                  <div className="text-center">
                    <div className="text-9xl font-bold text-cyan-600 opacity-20">
                      {trainer.name.charAt(0)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Contenido - ENORME y claro */}
          <motion.div className="order-1 lg:order-2 space-y-8" variants={containerVariants}>
            {/* Nombre ENORME */}
            <motion.div variants={contentVariants}>
              <h1 className="text-6xl lg:text-7xl font-bold text-slate-900 leading-tight">
                {trainer.name}
              </h1>
              <motion.p
                className="text-2xl font-semibold text-cyan-600 mt-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                Professional Trainer
              </motion.p>
            </motion.div>

            {/* Rating - GRANDE y visible */}
            {trainer.rating !== undefined && (
              <motion.div className="flex items-center gap-4" variants={contentVariants}>
                <div className="flex items-center gap-1 text-4xl">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="drop-shadow-sm">
                      {i < Math.floor(trainer.rating || 0) ? '⭐' : '☆'}
                    </span>
                  ))}
                </div>
                <div>
                  <span className="text-4xl font-bold text-slate-900">
                    {trainer.rating?.toFixed(1)}
                  </span>
                  {trainer.total_reviews !== undefined && (
                    <p className="text-lg text-slate-600 mt-1">
                      {trainer.total_reviews} {trainer.total_reviews === 1 ? 'review' : 'reviews'}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* Bio - Limpio y legible */}
            {trainer.bio && (
              <motion.p
                className="text-xl text-slate-700 leading-relaxed max-w-xl"
                variants={contentVariants}
              >
                {trainer.bio}
              </motion.p>
            )}

            {/* Especialidades - BADGES SEPARADOS */}
            {trainer.specializations && trainer.specializations.length > 0 && (
              <motion.div className="space-y-4" variants={contentVariants}>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                  Specializations
                </p>
                <div className="flex flex-wrap gap-3">
                  {trainer.specializations.map((spec, i) => (
                    <motion.div
                      key={spec}
                      className="px-5 py-3 rounded-full bg-cyan-100 text-cyan-700 text-lg font-semibold border-2 border-cyan-300 shadow-sm"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      whileHover={{
                        scale: 1.08,
                        backgroundColor: 'rgb(34 211 238)',
                        color: 'rgb(255 255 255)',
                        borderColor: 'rgb(6 182 212)',
                      }}
                    >
                      {spec}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* CTA */}
            <motion.div className="pt-4" variants={contentVariants}>
              <p className="text-lg text-slate-600 flex items-center gap-2">
                ⬇️ Scroll down to book your session
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  )
}
