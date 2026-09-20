'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface CourseCardProps {
  icon: ReactNode
  title: string
  description: string
  duration: string
  price: string
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

const RacketIcon = () => (
  <svg {...iconProps}>
    <ellipse cx="11" cy="9" rx="6.5" ry="7.5" />
    <line x1="11" y1="16.5" x2="11" y2="22" />
    <line x1="9" y1="22" x2="13" y2="22" />
  </svg>
)

const TrophyIcon = () => (
  <svg {...iconProps}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4" />
    <path d="M17 6h2.5a2.5 2.5 0 0 1-2.5 4" />
    <line x1="12" y1="14" x2="12" y2="18" />
    <line x1="8.5" y1="20.5" x2="15.5" y2="20.5" />
  </svg>
)

const PulseIcon = () => (
  <svg {...iconProps}>
    <path d="M3 12h3.5l2-5 3.5 10 2.5-6 1.5 3H21" />
  </svg>
)

const CourseCard = ({ icon, title, description, duration, price }: CourseCardProps) => (
  <div className="bg-white rounded-2xl ring-1 ring-gray-200/70 p-6 hover:ring-gray-300 transition-all duration-150 flex flex-col">
    <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
      {icon}
    </div>
    <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 text-sm text-gray-600">{description}</p>

    <div className="mt-4 flex items-baseline gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Duración
      </span>
      <span className="text-sm text-gray-700">{duration}</span>
    </div>

    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Precio
      </span>
      <span className="text-2xl font-bold text-gray-900 tabular-nums">{price}</span>
    </div>

    <button
      type="button"
      className="mt-5 h-12 px-6 rounded-xl bg-white text-gray-900 font-semibold ring-1 ring-inset ring-gray-200 hover:ring-gray-300 hover:bg-gray-50 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      Más información
    </button>
  </div>
)

export default function CoursesSection() {
  const courses: CourseCardProps[] = [
    {
      icon: <RacketIcon />,
      title: 'Masterclass Derecha',
      description: 'Perfecciona el golpe más importante del pádel con técnica avanzada.',
      duration: '6 semanas',
      price: 'RM 199',
    },
    {
      icon: <TrophyIcon />,
      title: 'Estrategia en Competición',
      description: 'Gana partidos cerrados con tácticas y mentalidad de campeón.',
      duration: '8 semanas',
      price: 'RM 249',
    },
    {
      icon: <PulseIcon />,
      title: 'Mentalidad Ganadora',
      description: 'Programa intensivo para dominar la presión y ganar mentalmente.',
      duration: '4 semanas',
      price: 'RM 149',
    },
  ]

  return (
    <section
      id="programas"
      className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 bg-gray-100 border-t border-gray-200/70 scroll-mt-20"
    >
      <div className="max-w-6xl mx-auto">
        <motion.header
          className="mb-10"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
            Programas y masterclasses
          </h2>
          <p className="mt-1.5 text-gray-500">
            Acelera tu progreso con entrenamiento estructurado
          </p>
        </motion.header>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          viewport={{ once: true, margin: '-80px' }}
        >
          {courses.map((course) => (
            <CourseCard key={course.title} {...course} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
