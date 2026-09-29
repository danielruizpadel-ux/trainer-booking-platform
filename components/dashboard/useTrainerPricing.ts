'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SessionPriceRow } from '@/lib/reservations/pricing'

/**
 * Precios vigentes del entrenador de la sesión (GET /api/dashboard/pricing).
 * Solo para enseñar: el servidor recalcula siempre lo que se cobra.
 */
export function useTrainerPricing() {
  const [rows, setRows] = useState<SessionPriceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/dashboard/pricing', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudieron cargar los precios')
      setRows(data.prices)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los precios')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { rows, error, reload, setRows }
}
