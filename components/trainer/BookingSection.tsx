'use client'

import AvailabilityCalendar from './AvailabilityCalendar'
import BookingForm from './BookingForm'

interface BookingSectionProps {
  trainerId: string
  trainerName: string
  trainerPrice?: number
  trainerEmail?: string
  trainerPhone?: string
}

export default function BookingSection({
  trainerId,
  trainerName,
  trainerPrice,
  trainerEmail,
  trainerPhone,
}: BookingSectionProps) {
  const handleDateSelect = () => {
    // Date/time selection handled within components
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Trainer Info & Calendar */}
        <div className="lg:col-span-2 space-y-8">
          {/* About Trainer */}
          <div className="bg-card rounded-lg border border-border p-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">About</h2>
            <p className="text-muted-foreground leading-relaxed">
              Professional fitness trainer with years of experience in helping clients achieve their goals through personalized training programs and guidance.
            </p>
          </div>

          {/* Availability Calendar */}
          <div className="bg-card rounded-lg border border-border p-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">Availability</h2>
            <AvailabilityCalendar
              trainerId={trainerId}
              onDateSelect={handleDateSelect}
            />
          </div>
        </div>

        {/* Right Column - Booking Form & Contact */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-lg border border-border p-8 sticky top-8">
            <div className="mb-6">
              <div className="text-sm text-muted-foreground">Session Price</div>
              <div className="text-4xl font-bold text-primary">
                ${trainerPrice || '99'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">per session</div>
            </div>

            <BookingForm trainerId={trainerId} trainerName={trainerName} />

            {/* Contact Info */}
            <div className="mt-8 pt-8 border-t border-border">
              <h4 className="font-semibold text-foreground mb-4">Contact</h4>
              <div className="space-y-2 text-sm">
                {trainerEmail && (
                  <div className="text-muted-foreground">
                    📧 {trainerEmail}
                  </div>
                )}
                {trainerPhone && (
                  <div className="text-muted-foreground">
                    📱 {trainerPhone}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
