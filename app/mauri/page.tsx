/**
 * Mauricio Martin — The Padel Doctor
 * Landing + reserva. Diseño: propuesta B v2 aprobada por Dani (DECISIONS 009).
 *
 * Solo se pinta lo que tiene datos aprobados y funciona hoy. Quedan FUERA de
 * la página hasta tener contenido autorizado (issue #31 / #32):
 *   - cinta y bloque de sponsors (no hay logos autorizados);
 *   - club en la cabecera del calendario (no confirmado);
 *   - "Sobre Mauri": bio, credenciales y redes (la bio de la base viene de un seed sin verificar);
 *   - paquetes de 5/10 clases (aún no se pueden contratar desde la web).
 * Detalle: docs/evidencias/mauri-b-v2-web/RESUMEN.md.
 */

import { notFound } from 'next/navigation'
import { Barlow_Condensed, Newsreader } from 'next/font/google'
import { getTrainerBySlug } from '@/lib/services/trainers-data.service'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { loadTrainerPrices } from '@/lib/reservations/trainer-prices'
import type { SessionPriceRow } from '@/lib/reservations/pricing'
import MauriHeader from '@/components/mauri/MauriHeader'
import PremiumHero from '@/components/mauri/PremiumHero'
import BookingSection from '@/components/mauri/BookingSection'
import OfferSection from '@/components/mauri/OfferSection'
import { normalizeDurations } from '@/lib/availability/durations'
import FooterSection from '@/components/mauri/FooterSection'

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-mauri-display',
  display: 'swap',
})
const serif = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-mauri-serif',
  display: 'swap',
})

export async function generateMetadata() {
  return {
    title: 'Mauricio Martin | Reserva tu sesión de pádel',
    description:
      'Consulta la disponibilidad semanal y solicita una sesión privada de pádel con Mauricio Martin.',
  }
}

/** Precios vigentes del entrenador, solo lectura. Si fallan, la oferta se queda sin cifra (no se inventa). */
async function readPrices(trainerId: string): Promise<SessionPriceRow[] | null> {
  try {
    const loaded = await loadTrainerPrices(getSupabaseServerClient(), trainerId)
    return loaded.ok ? loaded.rows : null
  } catch {
    return null
  }
}

export default async function MauriPage() {
  const trainer = await getTrainerBySlug('mauri')

  if (!trainer) {
    notFound()
  }

  // Use the trainer slug (works with updated availability API)
  // Falls back to trainer.id if available
  const trainerId = trainer.id || 'mauri'
  const classDurations = normalizeDurations(trainer.class_durations)
  const imageUrl = trainer.image_url || '/trainers/mauri/hero.jpg'
  const prices = trainer.id ? await readPrices(trainer.id) : null
  const firstName = trainer.name.trim().split(/\s+/)[0]

  return (
    <div className={`${display.variable} ${serif.variable} w-full bg-mauri-paper`}>
      <MauriHeader trainerSlug={trainer.slug} />

      <PremiumHero name={trainer.name} imageUrl={imageUrl} classDurations={classDurations} />

      {/* La reserva va lo primero al bajar del hero: es la acción principal. */}
      <BookingSection
        trainerId={trainerId}
        trainerName={trainer.name}
        trainerSlug={trainer.slug}
        trainerImageUrl={imageUrl}
        classDurations={classDurations}
        trainerEmail={trainer.email}
        trainerPhone={trainer.phone}
        variant="editorial"
      />

      <OfferSection trainerFirstName={firstName} classDurations={classDurations} prices={prices} />

      <FooterSection trainerName={trainer.name} />
    </div>
  )
}
