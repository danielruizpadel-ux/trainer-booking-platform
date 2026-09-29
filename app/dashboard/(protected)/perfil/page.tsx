import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getCurrentSession } from '@/lib/auth/current-trainer'
import { getSupabaseServerClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PublicProfileCard } from '@/components/dashboard/profile/PublicProfileCard'
import { ProfilePricing } from '@/components/dashboard/profile/ProfilePricing'
import { BookingSettingsCard } from '@/components/dashboard/profile/BookingSettingsCard'

export const metadata: Metadata = { title: 'Profile' }

/**
 * Perfil: lo que ven los clientes y lo que vende el entrenador.
 *   1. Perfil público (solo lectura, datos de `trainers`)
 *   2. Precios públicos (PricingCard, trainer_session_prices)
 *   3. Resumen de reserva (duraciones + URL) → Disponibilidad para editarlo
 *
 * El entrenador sale de la sesión (el layout ya ha exigido que exista).
 */
export default async function PerfilPage() {
  const { trainer } = await getCurrentSession()
  if (!trainer) return null

  // bio y especialidades no vienen en CurrentTrainer; solo lectura con la
  // service role, siempre de la fila del entrenador de la sesión.
  const { data: extra } = await getSupabaseServerClient()
    .from('trainers')
    .select('bio, specializations')
    .eq('id', trainer.id)
    .maybeSingle()

  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? ''
  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const publicPath = `/${trainer.slug}`
  const publicUrl = host ? `${protocol}://${host}${publicPath}` : publicPath

  return (
    <div className="max-w-4xl">
      <PageHeader eyebrow="Profile" title="Profile" description="What clients see and what you sell." />
      <div className="flex flex-col gap-6">
        <PublicProfileCard
          name={trainer.name}
          slug={trainer.slug}
          publicUrl={publicPath}
          imageUrl={trainer.image_url}
          bio={typeof extra?.bio === 'string' ? extra.bio : null}
          specializations={Array.isArray(extra?.specializations) ? (extra.specializations as string[]) : []}
          email={trainer.email}
          phone={trainer.phone}
        />
        <ProfilePricing offered={trainer.class_durations} />
        <BookingSettingsCard durations={trainer.class_durations} publicUrl={publicUrl} />
      </div>
    </div>
  )
}
