'use client'

import { motion } from 'framer-motion'

interface CtaSectionProps {
  onBookClick: () => void
}

export default function CtaSection({ onBookClick }: CtaSectionProps) {
  return (
    <motion.section
      className="py-20 px-6 bg-gradient-to-r from-blue-600 to-blue-700"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
    >
      <div className="max-w-2xl mx-auto text-center">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-white mb-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          viewport={{ once: true }}
        >
          ¿Listo para mejorar tu juego?
        </motion.h2>

        <motion.p
          className="text-lg text-blue-100 mb-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          viewport={{ once: true }}
        >
          No esperes más. Reserva tu sesión hoy y comienza tu transformación.
        </motion.p>

        <motion.button
          onClick={onBookClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-white text-blue-600 px-10 py-4 rounded-lg font-bold text-lg shadow-2xl hover:shadow-blue-300/50 transition-all"
        >
          Reservar ahora
        </motion.button>
      </div>
    </motion.section>
  )
}
