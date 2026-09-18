/**
 * Custom hook for reservation operations
 * Provides utility functions for creating and managing reservations
 */

'use client'

import { useState } from 'react'
import { CreateReservationRequest, Reservation } from '@/lib/domain/types'

interface UseReservationsReturn {
  isLoading: boolean
  error: string | null
  createReservation: (data: CreateReservationRequest) => Promise<Reservation | null>
  resetError: () => void
}

export function useReservations(): UseReservationsReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createReservation = async (data: CreateReservationRequest): Promise<Reservation | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to create reservation')
        return null
      }

      return result.data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }

  const resetError = () => setError(null)

  return {
    isLoading,
    error,
    createReservation,
    resetError,
  }
}
