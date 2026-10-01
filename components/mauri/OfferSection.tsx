import Reveal from './Reveal'
import { durationLabel } from '@/lib/availability/durations'
import { SESSION_DISCOUNTS, basePriceFor, type SessionPriceRow } from '@/lib/reservations/pricing'

interface OfferSectionProps {
  trainerFirstName: string
  classDurations: number[]
  /** Tabla vigente del entrenador (trainer_session_prices); null si no se pudo leer */
  prices: SessionPriceRow[] | null
}

/**
 * "Clases y precios" de /mauri (B v2). Solo lo que hoy funciona de verdad:
 *   - clase privada reservable en la agenda, con el precio de 1 jugador que
 *     el entrenador tiene configurado (el mismo que usa el checkout); sin
 *     precio configurado, la tarjeta se queda sin cifra;
 *   - descuento por volumen de una misma solicitud (lib/reservations/pricing).
 * Los paquetes de 5/10 NO se muestran: todavía no se pueden contratar desde
 * la web (ver docs/evidencias/mauri-b-v2-web/RESUMEN.md).
 */
export default function OfferSection({ trainerFirstName, classDurations, prices }: OfferSectionProps) {
  const priced = prices
    ? classDurations.flatMap((d) => {
        const price = basePriceFor(prices, d, 1)
        return price === null ? [] : [{ duration: d, price }]
      })
    : []
  const discounts = [...SESSION_DISCOUNTS].sort((a, b) => a.minSessions - b.minSessions)

  return (
    <section id="oferta" className="scroll-mt-16 bg-mauri-graphite px-4 py-16 text-mauri-paper sm:px-6 md:py-24 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-mauri-teal-light">
            <span className="font-mauri-display text-[13px] font-bold tracking-[0.1em] text-mauri-paper">02</span>
            Clases y precios
          </p>
          <h2 className="mt-3 font-mauri-display text-3xl font-extrabold uppercase leading-none">Una clase o varias</h2>
          <p className="mt-3 max-w-xl font-mauri-serif text-lg leading-snug text-[#CFD3D3]">
            Reservas en la agenda las clases que quieras. Cuantas más pides a la vez, mejor precio.
          </p>
        </Reveal>

        <Reveal className="mt-10 grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <article className="flex flex-col rounded-lg bg-mauri-steel p-6 sm:p-7">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-mauri-teal-light">Clase privada</p>
            <h3 className="mt-5 font-mauri-display text-[28px] font-extrabold uppercase leading-[0.95]">Sesión con {trainerFirstName}</h3>
            <p className="mt-3 font-mauri-serif text-base leading-snug text-[#C9D6DE]">
              Eliges día y hora en la agenda; {trainerFirstName} reserva la pista y te confirma la clase.
            </p>
            {priced.length > 0 && (
              <div className="mt-6 border-t border-white/15 pt-5">
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  {priced.map(({ duration, price }) => (
                    <div key={duration}>
                      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#B8C8D4]">{durationLabel(duration)}</dt>
                      <dd className="mt-1 font-mauri-display text-3xl font-extrabold tabular-nums">RM {price}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-[#B8C8D4]">Por clase con 1 jugador. Eliges cuántos venís al reservar y el precio se ajusta.</p>
              </div>
            )}
            <div className="flex-1" />
            <a
              href="#reserva"
              className="mt-7 inline-flex h-12 items-center justify-center rounded-md bg-mauri-paper font-mauri-display text-base font-bold uppercase tracking-[0.09em] text-mauri-graphite transition-colors hover:bg-white active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-mauri-teal-light focus-visible:ring-offset-2 focus-visible:ring-offset-mauri-steel"
            >
              Elegir hora
            </a>
          </article>

          <article className="flex flex-col rounded-lg bg-mauri-graphite-2 p-6 ring-1 ring-inset ring-mauri-graphite-line sm:p-7">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-mauri-muted-d">Varias clases</p>
            <dl className="mt-5 grid grid-cols-2 gap-4">
              {discounts.map((d) => (
                <div key={d.minSessions} className="flex flex-col-reverse">
                  <dt className="mt-2 text-sm text-mauri-muted-d">desde {d.minSessions} clases</dt>
                  <dd className="font-mauri-display text-3xl font-extrabold leading-none tabular-nums">−{d.percent}%</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 border-t border-mauri-graphite-line pt-5 font-mauri-serif text-base leading-snug text-[#C3C9CB]">
              El descuento se aplica al reservar varias clases en una misma solicitud. Lo ves en tu reserva antes de enviarla.
            </p>
          </article>
        </Reveal>

        <Reveal className="mt-14 grid gap-6 md:grid-cols-3 md:gap-4">
          {[
            ['01', 'Eliges hora', 'Una o varias clases en la agenda semanal.'],
            ['02', `${trainerFirstName} confirma la pista`, 'Tu solicitud queda pendiente hasta que la pista esté reservada.'],
            ['03', 'Confirmación', 'Si no hay pista, te pedirá elegir otra hora.'],
          ].map(([n, title, body]) => (
            <div key={n} className="relative border-t border-mauri-graphite-line pt-5">
              <span aria-hidden className="absolute -top-px left-0 h-0.5 w-12 bg-mauri-teal-light" />
              <p className="font-mauri-display text-3xl font-extrabold leading-none text-mauri-teal-light">{n}</p>
              <h3 className="mt-2 font-mauri-display text-lg font-bold uppercase tracking-[0.04em]">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-mauri-muted-d">{body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
