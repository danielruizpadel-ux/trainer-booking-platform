/**
 * Trainers listing page
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { alert, button, surface, text } from '@/components/ui/styles'

interface Trainer {
  id: string
  /** Página pública con la reserva: /<slug> (para mauri la sirve app/mauri). */
  slug?: string
  name: string
  bio?: string
  image_url?: string
  rating?: number
  total_reviews?: number
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Fotos que no cargan (URL caída): se pinta la inicial, como sin foto.
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadTrainers = async () => {
      try {
        const response = await fetch('/api/coaches')
        if (!response.ok) throw new Error('Failed to load trainers')
        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          setTrainers(data.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    loadTrainers()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/web" className={`-ml-3 ${button.ghost}`}>
            <Icon name="arrow-left" size={16} />
            Back to Home
          </Link>
          <h1 className={`mt-2 ${text.pageTitle}`}>Our Trainers</h1>
          <p className="mt-1.5 text-gray-500 tabular-nums" aria-live="polite">
            {isLoading ? 'Loading trainers...' : `${trainers.length} professional trainers available`}
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        {isLoading && (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i} className={`${surface.card} overflow-hidden`}>
                <div className="h-48 bg-gray-100 animate-pulse" />
                <div className="p-6 flex flex-col gap-3">
                  <div className="h-4 w-1/2 rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className={`mb-8 ${alert.error}`} role="alert">
            {error}
          </div>
        )}

        {!isLoading && trainers.length === 0 && !error && (
          <div className={`${surface.card} p-10 text-center max-w-lg mx-auto`}>
            <span className={`mx-auto ${surface.iconTile}`}>
              <Icon name="users" />
            </span>
            <p className="mt-4 text-sm text-gray-600">No trainers available at the moment</p>
            <Link href="/web" className={`mt-6 ${button.secondary}`}>
              Back to Home
            </Link>
          </div>
        )}

        {trainers.length > 0 && (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trainers.map(trainer => (
              <li key={trainer.id} className={`${surface.cardInteractive} overflow-hidden flex flex-col`}>
                <div className="w-full h-48 bg-blue-50 flex items-center justify-center">
                  {trainer.image_url && !failedImages.has(trainer.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={trainer.image_url}
                      alt={trainer.name}
                      onError={() => setFailedImages((prev) => new Set(prev).add(trainer.id))}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span aria-hidden className="h-16 w-16 rounded-full bg-white text-blue-600 text-2xl font-bold flex items-center justify-center ring-1 ring-gray-200/70">
                      {trainer.name.charAt(0)}
                    </span>
                  )}
                </div>

                <div className="p-6 flex flex-col flex-1">
                  <h2 className={text.cardTitle}>{trainer.name}</h2>

                  {trainer.bio && <p className="mt-1.5 text-sm text-gray-600 line-clamp-2">{trainer.bio}</p>}

                  {trainer.rating !== undefined && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm">
                      <Icon name="star" size={16} className="text-amber-400" />
                      <span className="font-semibold text-gray-900 tabular-nums">{trainer.rating.toFixed(1)}</span>
                      {trainer.total_reviews !== undefined && (
                        <span className="text-gray-500 tabular-nums">({trainer.total_reviews} reviews)</span>
                      )}
                    </p>
                  )}

                  <div className="mt-auto pt-6">
                    {trainer.slug ? (
                      <Link
                        href={`/${encodeURIComponent(trainer.slug)}#booking-section`}
                        className={`w-full ${button.primary}`}
                        aria-label={`Book Session with ${trainer.name}`}
                      >
                        Book Session
                      </Link>
                    ) : (
                      <Button className="w-full" disabled>
                        Book Session
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
