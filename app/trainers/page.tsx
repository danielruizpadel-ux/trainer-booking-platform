/**
 * Trainers listing page
 */

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface Trainer {
  id: string
  name: string
  bio?: string
  email?: string
  phone?: string
  image_url?: string
  rating?: number
  total_reviews?: number
}

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href="/web" className="text-sm text-primary hover:underline mb-2 block">
                ← Back to Home
              </Link>
              <h1 className="text-3xl font-bold text-foreground">Our Trainers</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {trainers.length} professional trainers available
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Loading trainers...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 mb-8">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {!isLoading && trainers.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No trainers available at the moment</p>
            <Link href="/web">
              <Button variant="outline">Back to Home</Button>
            </Link>
          </div>
        )}

        {trainers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {trainers.map(trainer => (
              <div
                key={trainer.id}
                className="bg-card rounded-lg border border-border overflow-hidden hover:border-primary transition-colors"
              >
                {/* Trainer image placeholder */}
                <div className="w-full h-48 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  {trainer.image_url ? (
                    <img
                      src={trainer.image_url}
                      alt={trainer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="text-2xl font-bold text-primary">
                          {trainer.name.charAt(0)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Trainer info */}
                <div className="p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {trainer.name}
                  </h3>

                  {trainer.bio && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {trainer.bio}
                    </p>
                  )}

                  {/* Rating */}
                  {trainer.rating !== undefined && (
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center">
                        <span className="text-sm text-yellow-500">★</span>
                        <span className="text-sm font-medium text-foreground ml-1">
                          {trainer.rating.toFixed(1)}
                        </span>
                      </div>
                      {trainer.total_reviews !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          ({trainer.total_reviews} reviews)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Contact info */}
                  <div className="space-y-1 mb-4">
                    {trainer.email && (
                      <p className="text-xs text-muted-foreground">
                        📧 {trainer.email}
                      </p>
                    )}
                    {trainer.phone && (
                      <p className="text-xs text-muted-foreground">
                        📱 {trainer.phone}
                      </p>
                    )}
                  </div>

                  {/* Action button */}
                  <Button className="w-full">
                    Book Session
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
