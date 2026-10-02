import Image from 'next/image'
import { durationLabel } from '@/lib/availability/durations'
import { SESSION_DISCOUNTS } from '@/lib/reservations/pricing'

interface PremiumHeroProps {
  name: string
  imageUrl: string
  /** Duraciones que ofrece el entrenador (trainers.class_durations) */
  classDurations: number[]
}

/**
 * Hero de /mauri (propuesta B v2 aprobada por Dani, DECISIONS 009): grafito,
 * foto real a la derecha, nombre en condensada con el apellido en contorno.
 * Solo datos reales: duraciones del entrenador y el descuento por volumen que
 * aplica el servidor. La entrada es CSS `motion-safe` (nada con movimiento
 * reducido).
 */
export default function PremiumHero({ name, imageUrl, classDurations }: PremiumHeroProps) {
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.join(' ')
  const maxDiscount = Math.max(...SESSION_DISCOUNTS.map((d) => d.percent))
  const minForMax = SESSION_DISCOUNTS.find((d) => d.percent === maxDiscount)?.minSessions

  return (
    <section className="relative overflow-hidden bg-mauri-graphite text-mauri-paper md:min-h-[560px]">
      <div className="relative h-[300px] motion-safe:animate-mauri-settle md:absolute md:inset-y-0 md:left-[40%] md:right-0 md:h-auto">
        <Image
          src={imageUrl}
          alt={`${name} jugando al pádel`}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 60vw"
          className="object-cover object-[50%_45%] brightness-90 contrast-[1.06] saturate-[.8] md:object-[50%_58%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(0deg,#15191B_6%,rgba(21,25,27,.55)_34%,rgba(21,25,27,0)_68%)] md:bg-[linear-gradient(90deg,#15191B_0%,rgba(21,25,27,.6)_24%,rgba(21,25,27,0)_52%),linear-gradient(0deg,rgba(21,25,27,.75),rgba(21,25,27,0)_38%)]"
        />
      </div>

      <div className="relative z-10 mx-auto -mt-28 flex max-w-6xl flex-col px-4 pb-8 sm:px-6 md:mt-0 md:min-h-[560px] md:justify-center md:py-12 lg:px-8">
        <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-mauri-teal-light motion-safe:animate-mauri-rise">
          <span aria-hidden className="h-px w-8 bg-current" />
          Clases privadas de pádel
        </p>
        <h1 className="mt-4 font-mauri-display text-[68px] font-extrabold uppercase leading-[0.84] [animation-delay:100ms] motion-safe:animate-mauri-rise md:mt-5 md:text-[112px]">
          <span className="block">{first}</span>
          {last && <span className="block text-transparent [-webkit-text-stroke:1.4px_#FAF7F1]">{last}</span>}
        </h1>
        <p className="mt-5 max-w-[25em] font-mauri-serif text-lg leading-snug text-[#DAD8D1] [animation-delay:200ms] motion-safe:animate-mauri-rise md:mt-6 md:text-[21px]">
          Elige tu hora en su agenda semanal. <em className="text-mauri-paper">{first} reserva la pista y te confirma</em> la clase.
        </p>
        <div className="mt-6 flex gap-3 [animation-delay:300ms] motion-safe:animate-mauri-rise md:mt-8">
          <a
            href="#reserva"
            className="inline-flex h-12 flex-1 items-center justify-center gap-2.5 rounded-md bg-mauri-paper px-6 font-mauri-display text-base font-bold uppercase tracking-[0.09em] text-mauri-graphite transition-colors hover:bg-white active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light focus-visible:ring-offset-2 focus-visible:ring-offset-mauri-graphite md:flex-none"
          >
            Ver horarios
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </a>
          <a
            href="#oferta"
            className="hidden h-12 items-center rounded-md px-6 font-mauri-display text-base font-bold uppercase tracking-[0.09em] ring-1 ring-inset ring-mauri-graphite-line transition-colors hover:ring-mauri-muted-d active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light md:inline-flex"
          >
            Clases y precios
          </a>
        </div>
        <dl className="mt-7 flex [animation-delay:380ms] motion-safe:animate-mauri-rise md:mt-10">
          <div className="flex flex-col-reverse pr-5 md:pr-7">
            <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-mauri-muted-d">Duración</dt>
            <dd className="font-mauri-display text-xl font-bold tabular-nums md:text-[26px]">
              {classDurations.map(durationLabel).join(' · ')}
            </dd>
          </div>
          <div className="flex flex-col-reverse border-l border-mauri-graphite-line pl-5 md:pl-7">
            <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-mauri-muted-d">
              Desde {minForMax} clases
            </dt>
            <dd className="font-mauri-display text-xl font-bold tabular-nums md:text-[26px]">Hasta −{maxDiscount} %</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
