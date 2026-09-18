/**
 * Availability Calendar Component
 * Displays available time slots for booking
 */

'use client'

import { useEffect, useState } from 'react'

interface AvailabilitySlot {
  id: string
  date: string
  start_time: string
  end_time: string
  max_capacity: number
  current_bookings: number
}

interface AvailabilityCalendarProps {
  trainerId: string
  onDateSelect?: (date: string, time: string) => void
}

export default function AvailabilityCalendar({
  trainerId,
  onDateSelect,
}: AvailabilityCalendarProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  useEffect(() => {
    const loadSlots = async () => {
      try {
        const today = new Date()
        const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)

        const startDate = today.toISOString().split('T')[0]
        const endDate = twoWeeksLater.toISOString().split('T')[0]

        const response = await fetch(
          `/api/availability?trainer_id=${trainerId}&start_date=${startDate}&end_date=${endDate}`
        )

        if (!response.ok) throw new Error('Failed to load availability')

        const data = await response.json()
        if (data.success && Array.isArray(data.data)) {
          setSlots(data.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading availability')
      } finally {
        setIsLoading(false)
      }
    }

    loadSlots()
  }, [trainerId])

  // Group slots by date
  const slotsByDate = slots.reduce(
    (acc, slot) => {
      if (!acc[slot.date]) {
        acc[slot.date] = []
      }
      acc[slot.date].push(slot)
      return acc
    },
    {} as Record<string, AvailabilitySlot[]>
  )

  const dates = Object.keys(slotsByDate).sort()
  const selectedDateSlots = selectedDate ? slotsByDate[selectedDate] : []

  return (
    <div className="space-y-6">
      {isLoading && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading availability...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Date Selection */}
          <div>
            <h3 className="font-semibold text-foreground mb-3">Select Date</h3>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {dates.map(date => {
                const dateObj = new Date(date)
                const label = dateObj.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
                return (
                  <button
                    key={date}
                    onClick={() => {
                      setSelectedDate(date)
                      setSelectedTime(null)
                      onDateSelect?.(date, '')
                    }}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      selectedDate === date
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-foreground hover:border-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Time Selection */}
          {selectedDate && (
            <div>
              <h3 className="font-semibold text-foreground mb-3">Select Time</h3>
              {selectedDateSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No available times</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {selectedDateSlots.map(slot => {
                    const isAvailable = slot.current_bookings < slot.max_capacity
                    return (
                      <button
                        key={slot.id}
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedTime(slot.start_time)
                            onDateSelect?.(selectedDate, slot.start_time)
                          }
                        }}
                        disabled={!isAvailable}
                        className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          selectedTime === slot.start_time
                            ? 'border-primary bg-primary/10 text-primary'
                            : isAvailable
                            ? 'border-border text-foreground hover:border-primary/50'
                            : 'border-border/50 text-muted-foreground/50 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {slot.start_time}
                        {!isAvailable && (
                          <span className="block text-xs mt-1">Full</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selection Summary */}
          {selectedDate && selectedTime && (
            <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Selected: </span>
                {new Date(selectedDate).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                at {selectedTime}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
