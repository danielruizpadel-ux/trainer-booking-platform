'use client'

import { useState, useEffect } from 'react'
import { Trainer, AvailabilitySlot, CreateReservationRequest } from '@/lib/domain/types'
import { useReservations } from '@/lib/utils/use-reservations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ReservationWidgetProps {
  trainerId?: string
  classTypes?: string[]
  daysAhead?: number
}

type Step = 'trainer' | 'class-type' | 'date' | 'time' | 'client-info' | 'confirmation'

interface FormData {
  client_name: string
  client_phone: string
  client_email: string
}

export function ReservationWidget({
  trainerId: initialTrainerId,
  classTypes = ['individual', 'group', 'semi-private'],
  daysAhead = 30,
}: ReservationWidgetProps) {
  const [currentStep, setCurrentStep] = useState<Step>('trainer')
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null)
  const [selectedClassType, setSelectedClassType] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([])
  const [formData, setFormData] = useState<FormData>({
    client_name: '',
    client_phone: '',
    client_email: '',
  })
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(true)
  const [isLoadingSlots, setIsLoadingSlots] = useState(false)
  const { isLoading: isCreatingReservation, error: reservationError, createReservation, resetError } = useReservations()
  const [reservationSuccess, setReservationSuccess] = useState(false)

  useEffect(() => {
    loadTrainers()
  }, [])

  useEffect(() => {
    if (initialTrainerId && trainers.length > 0) {
      const trainer = trainers.find(t => t.id === initialTrainerId)
      if (trainer) {
        setSelectedTrainer(trainer)
        setCurrentStep('class-type')
      }
    }
  }, [initialTrainerId, trainers])

  useEffect(() => {
    if (selectedDate && selectedTrainer && selectedClassType) {
      loadAvailableSlots()
    }
  }, [selectedDate, selectedTrainer, selectedClassType])

  const loadTrainers = async () => {
    setIsLoadingTrainers(true)
    try {
      const response = await fetch('/api/coaches')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setTrainers(data.data)
      }
    } catch (error) {
      console.error('Failed to load trainers:', error)
    } finally {
      setIsLoadingTrainers(false)
    }
  }

  const loadAvailableSlots = async () => {
    if (!selectedTrainer || !selectedDate || !selectedClassType) return

    setIsLoadingSlots(true)
    try {
      const params = new URLSearchParams({
        trainer_id: selectedTrainer.id,
        date: selectedDate,
        class_type: selectedClassType,
      })
      const response = await fetch(`/api/disponibilidad?${params}`)
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setAvailableSlots(data.data)
      }
    } catch (error) {
      console.error('Failed to load available slots:', error)
    } finally {
      setIsLoadingSlots(false)
    }
  }

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    if (!selectedTrainer || !selectedDate || !selectedTime || !selectedClassType) {
      alert('Please complete all selections')
      return
    }

    if (!formData.client_name || !formData.client_phone) {
      alert('Please enter your name and phone number')
      return
    }

    const reservationData: CreateReservationRequest = {
      trainer_id: selectedTrainer.id,
      client_name: formData.client_name,
      client_phone: formData.client_phone,
      client_email: formData.client_email,
      session_date: selectedDate,
      session_time: selectedTime,
      class_type: selectedClassType,
    }

    const result = await createReservation(reservationData)
    if (result) {
      setReservationSuccess(true)
      setCurrentStep('confirmation')
    }
  }

  const getAvailableDates = () => {
    const dates = []
    const today = new Date()
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today)
      date.setDate(date.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  if (currentStep === 'trainer') {
    return (
      <div className="space-y-6 p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Select Your Trainer</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choose a trainer to book a session</p>
        </div>

        {isLoadingTrainers ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading trainers...</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {trainers.map(trainer => (
              <button
                key={trainer.id}
                onClick={() => {
                  setSelectedTrainer(trainer)
                  setCurrentStep('class-type')
                }}
                className="flex items-center gap-4 rounded-lg border border-border p-4 text-left transition-all hover:border-primary hover:bg-accent/5"
              >
                {trainer.image_url && (
                  <img
                    src={trainer.image_url}
                    alt={trainer.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                )}
                <div className="flex-1">
                  <p className="font-semibold">{trainer.name}</p>
                  {trainer.bio && <p className="text-sm text-muted-foreground">{trainer.bio}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (currentStep === 'class-type') {
    return (
      <div className="space-y-6 p-6">
        <div>
          <button
            onClick={() => {
              setSelectedTrainer(null)
              setCurrentStep('trainer')
            }}
            className="text-sm text-primary hover:underline"
          >
            ← Back
          </button>
          <h2 className="mt-4 text-2xl font-bold">Select Class Type</h2>
          <p className="mt-2 text-sm text-muted-foreground">What type of session would you like?</p>
        </div>

        <div className="grid gap-4">
          {classTypes.map(type => (
            <button
              key={type}
              onClick={() => {
                setSelectedClassType(type)
                setCurrentStep('date')
              }}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                selectedClassType === type
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <p className="font-semibold capitalize">{type}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {type === 'individual' && 'One-on-one training session'}
                {type === 'group' && 'Group training session'}
                {type === 'semi-private' && 'Semi-private session (2-4 people)'}
              </p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (currentStep === 'date') {
    const availableDates = getAvailableDates()
    return (
      <div className="space-y-6 p-6">
        <div>
          <button
            onClick={() => setCurrentStep('class-type')}
            className="text-sm text-primary hover:underline"
          >
            ← Back
          </button>
          <h2 className="mt-4 text-2xl font-bold">Select Date</h2>
          <p className="mt-2 text-sm text-muted-foreground">When would you like your session?</p>
        </div>

        <div className="grid gap-2 max-h-80 overflow-y-auto">
          {availableDates.map(date => {
            const dateStr = date.toISOString().split('T')[0]
            return (
              <button
                key={dateStr}
                onClick={() => {
                  setSelectedDate(dateStr)
                  setSelectedTime(null)
                  setCurrentStep('time')
                }}
                className={`rounded-lg border-2 p-3 text-left transition-all ${
                  selectedDate === dateStr
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold">{date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                <p className="text-xs text-muted-foreground">{dateStr}</p>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (currentStep === 'time') {
    return (
      <div className="space-y-6 p-6">
        <div>
          <button
            onClick={() => setCurrentStep('date')}
            className="text-sm text-primary hover:underline"
          >
            ← Back
          </button>
          <h2 className="mt-4 text-2xl font-bold">Select Time</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedDate && new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {isLoadingSlots ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading available times...</p>
          </div>
        ) : availableSlots.length === 0 ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-center">
            <p className="text-sm text-destructive">No available slots for this date</p>
            <button
              onClick={() => setCurrentStep('date')}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Choose another date
            </button>
          </div>
        ) : (
          <div className="grid gap-2 max-h-80 overflow-y-auto">
            {availableSlots.map(slot => (
              <button
                key={slot.id}
                onClick={() => {
                  setSelectedTime(slot.start_time)
                  setCurrentStep('client-info')
                }}
                className={`rounded-lg border-2 p-3 text-left transition-all ${
                  selectedTime === slot.start_time
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="font-semibold">{slot.start_time}</p>
                <p className="text-xs text-muted-foreground">
                  {slot.current_bookings}/{slot.max_capacity} spots taken
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (currentStep === 'client-info') {
    return (
      <div className="space-y-6 p-6">
        <div>
          <button
            onClick={() => setCurrentStep('time')}
            className="text-sm text-primary hover:underline"
          >
            ← Back
          </button>
          <h2 className="mt-4 text-2xl font-bold">Your Information</h2>
          <p className="mt-2 text-sm text-muted-foreground">Complete your booking details</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Full Name *</label>
            <Input
              type="text"
              placeholder="Your name"
              value={formData.client_name}
              onChange={e => handleFormChange('client_name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Phone Number *</label>
            <Input
              type="tel"
              placeholder="Your phone number"
              value={formData.client_phone}
              onChange={e => handleFormChange('client_phone', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <Input
              type="email"
              placeholder="Your email (optional)"
              value={formData.client_email}
              onChange={e => handleFormChange('client_email', e.target.value)}
            />
          </div>
        </div>

        {reservationError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{reservationError}</p>
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isCreatingReservation || !formData.client_name || !formData.client_phone}
          className="w-full"
        >
          {isCreatingReservation ? 'Booking...' : 'Complete Booking'}
        </Button>
      </div>
    )
  }

  if (currentStep === 'confirmation' && reservationSuccess) {
    return (
      <div className="space-y-6 p-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold">Booking Confirmed!</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your session has been successfully reserved</p>
        </div>

        <div className="space-y-2 rounded-lg bg-muted p-4 text-left">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Trainer</p>
            <p className="font-semibold">{selectedTrainer?.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Date & Time</p>
            <p className="font-semibold">{selectedDate} at {selectedTime}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Class Type</p>
            <p className="font-semibold capitalize">{selectedClassType}</p>
          </div>
        </div>

        <Button
          onClick={() => {
            setCurrentStep('trainer')
            setSelectedTrainer(null)
            setSelectedClassType(null)
            setSelectedDate(null)
            setSelectedTime(null)
            setFormData({ client_name: '', client_phone: '', client_email: '' })
            setReservationSuccess(false)
            resetError()
          }}
          variant="outline"
          className="w-full"
        >
          Book Another Session
        </Button>
      </div>
    )
  }

  return null
}
