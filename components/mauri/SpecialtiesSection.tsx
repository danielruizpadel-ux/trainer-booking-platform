'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface SpecialtyCardProps {
  icon: ReactNode
  title: string
  description: string
  example: string
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const CrosshairIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="1.5" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22.5" />
    <line x1="1.5" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22.5" y2="12" />
  </svg>
)

const CompassIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9 16.2 7.8" />
  </svg>
)

const SparkIcon = () => (
  <svg {...iconProps}>
    <path d="M12 2.5l2.1 5.4 5.4 2.1-5.4 2.1-2.1 5.4-2.1-5.4L4.5 10l5.4-2.1L12 2.5z" />
    <path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
  </svg>
)

const SpecialtyCard = ({ icon, title, description, example }: SpecialtyCardProps) => (
  <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 hover:ring-gray-300 transition-all duration-150">
    <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
      {icon}
    </div>
    <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 text-sm text-gray-600">{description}</p>
    <p className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500">
      Ejemplo: {example}
    </p>
  </div>
)

export default function SpecialtiesSection() {
  const specialties: SpecialtyCardProps[] = [
    {
      icon: <CrosshairIcon />,
      title: 'Técnica Clínica',
      description:
        'Analizo cada movimiento con precisión para optimizar tu golpe y mejorar tu consistencia.',
      example: 'Corrección de grip, postura y seguimiento',
    },
    {
      icon: <CompassIcon />,
      title: 'Estrategia Competitiva',
      description:
        'Aprende a leer el juego, posicionarte correctamente y ganar mentalmente.',
      example: 'Gestión de puntos clave y adaptación táctica',
    },
    {
      icon: <SparkIcon />,
      title: 'Mentalidad Ganadora',
      description:
        'Desarrollo psicológico para mantener la calma bajo presión y ganar partidos cerrados.',
      example: 'Gestión del estrés y confianza en competición',
    },
  ]

  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Mi enfoque
          </h2>
          <p className="mt-1.5 text-gray-500">Tres pilares para transformar tu juego</p>
        </motion.header>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          {specialties.map((specialty) => (
            <SpecialtyCard key={specialty.title} {...specialty} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
