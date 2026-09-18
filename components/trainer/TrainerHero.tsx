/**
 * Trainer Hero Section Component
 * Displays trainer photo, name, bio, and key info
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface TrainerHeroProps {
  trainer: {
    id: string
    name: string
    bio?: string
    image_url?: string
    rating?: number
    total_reviews?: number
    specializations?: string[]
  }
}

export default function TrainerHero({ trainer }: TrainerHeroProps) {
  return (
    <div className="relative bg-gradient-to-br from-primary/10 to-accent/10 border-b border-border">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {/* Photo */}
          <div className="md:col-span-1">
            <div className="w-full aspect-square rounded-lg overflow-hidden bg-card border border-border">
              {trainer.image_url ? (
                <img
                  src={trainer.image_url}
                  alt={trainer.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-accent/20">
                  <div className="text-center">
                    <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-5xl font-bold text-primary">
                        {trainer.name.charAt(0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="md:col-span-2">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              {trainer.name}
            </h1>

            {/* Rating */}
            {trainer.rating !== undefined && (
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center">
                  <span className="text-lg text-yellow-500">★</span>
                  <span className="text-lg font-semibold text-foreground ml-1">
                    {trainer.rating.toFixed(1)}
                  </span>
                </div>
                {trainer.total_reviews !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    ({trainer.total_reviews} {trainer.total_reviews === 1 ? 'review' : 'reviews'})
                  </span>
                )}
              </div>
            )}

            {/* Bio */}
            {trainer.bio && (
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                {trainer.bio}
              </p>
            )}

            {/* Specializations */}
            {trainer.specializations && trainer.specializations.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-foreground mb-2">Specializations</p>
                <div className="flex flex-wrap gap-2">
                  {trainer.specializations.map(spec => (
                    <span
                      key={spec}
                      className="px-3 py-1 bg-primary/10 text-primary text-sm rounded-full"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-3">
              <Button className="px-6">Book Now</Button>
              <Link href="/trainers">
                <Button variant="outline" className="px-6">
                  Back to Trainers
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
