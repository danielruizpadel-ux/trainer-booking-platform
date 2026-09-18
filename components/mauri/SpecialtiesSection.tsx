'use client'

import { motion } from 'framer-motion'

interface SpecialtiesCardProps {
  icon: string
  title: string
  description: string
  example: string
}

const SpecialtiesCard = ({ icon, title, description, example }: SpecialtiesCardProps) => (
  <motion.div
    className="bg-white rounded-xl p-8 shadow-md hover:shadow-xl transition-shadow border-l-4 border-blue-600"
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    viewport={{ once: true }}
    whileHover={{ y: -5 }}
  >
    <div className="text-4xl mb-4">{icon}</div>
    <h3 className="text-2xl font-bold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-600 mb-4">{description}</p>
    <p className="text-sm text-blue-600 font-semibold italic">Ejemplo: {example}</p>
  </motion.div>
)

export default function SpecialtiesSection() {
  const specialties: SpecialtiesCardProps[] = [
    {
      icon: '🎯',
      title: 'Técnica Clínica',
      description:
        'Analizo cada movimiento con precisión para optimizar tu golpe y mejorar tu consistencia.',
      example: 'Corrección de grip, postura y seguimiento',
    },
    {
      icon: '♟️',
      title: 'Estrategia Competitiva',
      description:
        'Aprende a leer el juego, posicionarte correctamente y ganar mentalmente.',
      example: 'Gestión de puntos clave y adaptación táctica',
    },
    {
      icon: '🧠',
      title: 'Mentalidad Ganadora',
      description:
        'Desarrollo psicológico para mantener la calma bajo presión y ganar partidos cerrados.',
      example: 'Gestión del estrés y confianza en competición',
    },
  ]

  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Mi Enfoque
          </h2>
          <p className="text-xl text-gray-600">
            Tres pilares para transformar tu juego
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {specialties.map((specialty) => (
            <SpecialtiesCard key={specialty.title} {...specialty} />
          ))}
        </div>
      </div>
    </section>
  )
}
