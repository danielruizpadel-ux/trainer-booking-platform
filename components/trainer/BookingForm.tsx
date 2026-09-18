'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface BookingFormProps {
  trainerId: string
  trainerName: string
}

interface FormData {
  client_name: string
  client_email: string
  client_phone?: string
  date: string
  time: string
  notes?: string
}

interface FormErrors {
  [key: string]: string
}

export default function BookingForm({
  trainerId,
  trainerName,
}: BookingFormProps) {
  const [formData, setFormData] = useState<FormData>({
    client_name: '',
    client_email: '',
    client_phone: '',
    date: '',
    time: '',
    notes: '',
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.client_name.trim()) {
      newErrors.client_name = 'Name is required'
    }

    if (!formData.client_email.trim()) {
      newErrors.client_email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.client_email)) {
      newErrors.client_email = 'Invalid email address'
    }

    if (!selectedDate) {
      newErrors.date = 'Please select a date'
    }

    if (!selectedTime) {
      newErrors.time = 'Please select a time'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }


  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }))
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setSubmitStatus(null)

    try {
      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainer_id: trainerId,
          client_name: formData.client_name,
          client_email: formData.client_email,
          client_phone: formData.client_phone || null,
          date: selectedDate,
          time: selectedTime,
          notes: formData.notes || null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create reservation')
      }

      await response.json()

      setSubmitStatus({
        type: 'success',
        message: `Booking confirmed! A confirmation email has been sent to ${formData.client_email}. Your session with ${trainerName} is scheduled for ${new Date(selectedDate).toLocaleDateString()} at ${selectedTime}.`,
      })

      setFormData({
        client_name: '',
        client_email: '',
        client_phone: '',
        date: '',
        time: '',
        notes: '',
      })
      setSelectedDate('')
      setSelectedTime('')
    } catch (error) {
      setSubmitStatus({
        type: 'error',
        message:
          error instanceof Error ? error.message : 'An error occurred. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="client_name" className="block text-sm font-medium text-foreground mb-1">
          Your Name *
        </label>
        <input
          type="text"
          id="client_name"
          name="client_name"
          value={formData.client_name}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
            errors.client_name
              ? 'border-destructive focus:outline-none focus:ring-2 focus:ring-destructive'
              : 'border-border focus:outline-none focus:ring-2 focus:ring-primary'
          } bg-background text-foreground`}
          placeholder="John Doe"
          disabled={isSubmitting}
        />
        {errors.client_name && (
          <p className="text-xs text-destructive mt-1">{errors.client_name}</p>
        )}
      </div>

      {/* Email */}
      <div>
        <label htmlFor="client_email" className="block text-sm font-medium text-foreground mb-1">
          Email *
        </label>
        <input
          type="email"
          id="client_email"
          name="client_email"
          value={formData.client_email}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
            errors.client_email
              ? 'border-destructive focus:outline-none focus:ring-2 focus:ring-destructive'
              : 'border-border focus:outline-none focus:ring-2 focus:ring-primary'
          } bg-background text-foreground`}
          placeholder="john@example.com"
          disabled={isSubmitting}
        />
        {errors.client_email && (
          <p className="text-xs text-destructive mt-1">{errors.client_email}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="client_phone" className="block text-sm font-medium text-foreground mb-1">
          Phone (Optional)
        </label>
        <input
          type="tel"
          id="client_phone"
          name="client_phone"
          value={formData.client_phone}
          onChange={handleInputChange}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground transition-colors"
          placeholder="+1 (555) 123-4567"
          disabled={isSubmitting}
        />
      </div>

      {/* Selected Date/Time Display */}
      {selectedDate && selectedTime && (
        <div className="rounded-lg bg-primary/10 p-3 border border-primary/20">
          <p className="text-xs text-muted-foreground mb-1">Selected Session</p>
          <p className="text-sm font-semibold text-foreground">
            {new Date(selectedDate).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}{' '}
            at {selectedTime}
          </p>
        </div>
      )}

      {/* Date/Time Error */}
      {(errors.date || errors.time) && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">
            {errors.date || errors.time}
          </p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1">
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleInputChange}
          className="w-full px-3 py-2 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground transition-colors resize-none"
          placeholder="Any special requests or notes for your trainer?"
          rows={3}
          disabled={isSubmitting}
        />
      </div>

      {/* Submit Status Messages */}
      {submitStatus && (
        <div
          className={`rounded-lg p-3 border text-sm ${
            submitStatus.type === 'success'
              ? 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400'
              : 'border-destructive/50 bg-destructive/5 text-destructive'
          }`}
        >
          <p>{submitStatus.message}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting || !selectedDate || !selectedTime}
      >
        {isSubmitting ? 'Booking...' : `Book with ${trainerName}`}
      </Button>

      {/* Help Text */}
      <p className="text-xs text-muted-foreground text-center">
        Select your preferred date and time from the calendar above, then complete this form to confirm.
      </p>
    </form>
  )
}
