'use client'

import { motion } from 'framer-motion'

interface CourseCardProps {
  icon: string
  title: string
  description: string
  duration: string
  price: string
}

const CourseCard = ({ icon, title, description, duration, price }: CourseCardProps) => (
  <motion.div
    className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-8 shadow-md hover:shadow-lg transition-all"
    initial={{ opacity: 0, scale: 0.95 }}
    whileInView={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.5 }}
    viewport={{ once: true }}
    whileHover={{ y: -8 }}
  >
    <div className="text-5xl mb-4">{icon}</div>
    <h3 className="text-2xl font-bold text-gray-900 mb-3">{title}</h3>
    <p className="text-gray-700 mb-4 min-h-12">{description}</p>

    <div className="bg-white rounded-lg p-4 mb-4">
      <p className="text-sm text-gray-600 mb-1">Duración</p>
      <p className="font-semibold text-gray-900">{duration}</p>
    </div>

    <div className="flex items-center justify-between mb-6">
      <span className="text-sm text-gray-600">Precio</span>
      <span className="text-3xl font-bold text-blue-600">{price}</span>
    </div>

    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
    >
      Más información
    </motion.button>
  </motion.div>
)

export default function CoursesSection() {
  const courses: CourseCardProps[] = [
    {
      icon: '🎾',
      title: 'Masterclass Derecha',
      description: 'Perfecciona el golpe más importante del pádel con técnica avanzada.',
      duration: '6 semanas',
      price: '$199',
    },
    {
      icon: '🏆',
      title: 'Estrategia en Competición',
      description: 'Gana partidos cerrados con tácticas y mentalidad de campeón.',
      duration: '8 semanas',
      price: '$249',
    },
    {
      icon: '💪',
      title: 'Mentalidad Ganadora',
      description: 'Programa intensivo para dominar la presión y ganar mentalmente.',
      duration: '4 semanas',
      price: '$149',
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
            Programas & Masterclasses
          </h2>
          <p className="text-xl text-gray-600">
            Acelera tu progreso con entrenamiento estructurado
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {courses.map((course) => (
            <CourseCard key={course.title} {...course} />
          ))}
        </div>
      </div>
    </section>
  )
}
