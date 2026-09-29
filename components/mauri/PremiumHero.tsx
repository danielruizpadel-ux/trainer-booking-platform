'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface PremiumHeroProps {
  name: string
  imageUrl: string
}

export default function PremiumHero({ name, imageUrl }: PremiumHeroProps) {
  return (
    <section className="relative overflow-hidden bg-[#252824] text-[#f8f5ed]">
      <div className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] sm:text-sm">
          The Padel Doctor
        </span>
        <a
          href="#reserva"
          className="rounded-full border border-[#f8f5ed]/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-[#f8f5ed] hover:text-[#252824] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f8f5ed]"
        >
          Reservar
        </a>
      </div>

      <div className="relative mx-auto grid min-h-[440px] max-w-7xl items-end md:min-h-[520px] md:grid-cols-[45%_55%] md:items-center">
        <div className="absolute inset-0 md:inset-y-0 md:left-[45%] md:right-0">
          <Image
            src={imageUrl}
            alt={`${name} jugando al pádel`}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 55vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#252824] via-[#252824]/35 to-[#252824]/10 md:bg-gradient-to-r md:from-[#252824]/65 md:via-transparent md:to-transparent" />
        </div>

        <motion.div
          className="relative z-10 px-4 pb-12 pt-24 sm:px-6 md:py-14 lg:px-8"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#d8d1bf]">
            Entrenamiento privado de pádel
          </p>
          <h1 className="max-w-xl text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl lg:text-6xl">
            {name}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[#e5dfd2]">
            Encuentra una hora que encaje contigo. Elige tu sesión directamente
            en la agenda.
          </p>
          <a
            href="#reserva"
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-[#f8f5ed] px-7 text-sm font-semibold text-[#252824] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f8f5ed]"
          >
            Ver disponibilidad{' '}
            <span aria-hidden="true" className="ml-3">
              ↗
            </span>
          </a>
        </motion.div>
      </div>
    </section>
  )
}
