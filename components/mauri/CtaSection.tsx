'use client'

import { motion } from 'framer-motion'

export default function CtaSection() {
  const handleBookClick = () => {
    document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50 border-t border-gray-200/70">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="bg-gray-950 rounded-3xl px-8 py-14 text-center"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            ¿Listo para mejorar tu juego?
          </h2>
          <p className="mt-2 text-gray-400">
            No esperes más. Reserva tu sesión hoy y comienza tu transformación.
          </p>

          <button
            type="button"
            onClick={handleBookClick}
            className="mt-8 h-12 px-6 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 active:scale-[0.98] shadow-sm shadow-blue-600/25 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            Reservar ahora
          </button>
        </motion.div>
      </div>
    </section>
  )
}
