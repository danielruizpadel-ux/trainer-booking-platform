'use client'

import { useTrainerPricing } from '@/components/dashboard/useTrainerPricing'
import { PricingCard } from './PricingCard'

/** Precios públicos en Perfil: el mismo hook y la misma API que usa el resto del dashboard. */
export function ProfilePricing({ offered }: { offered: number[] }) {
  const pricing = useTrainerPricing()
  return <PricingCard pricing={pricing} offered={offered} />
}
