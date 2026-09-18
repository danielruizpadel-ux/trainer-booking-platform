/**
 * Core domain types for the trainer booking platform
 * These types define the data structures shared across the application
 */

// ============================================================================
// Trainer/Coach Types
// ============================================================================
export type Trainer = {
  id: string
  name: string
  bio?: string
  email: string
  phone: string
  image_url?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Client Types
// ============================================================================
export type Client = {
  id: string
  phone: string
  name: string
  email?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Reservation Types
// ============================================================================
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export type Reservation = {
  id: string
  trainer_id: string
  client_id: string
  session_date: string
  session_time: string
  session_duration: number // in minutes
  class_type: string // 'individual' | 'group' | 'semi-private'
  price: number
  status: ReservationStatus
  notes?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Availability Types
// ============================================================================
export type AvailabilitySlot = {
  id: string
  trainer_id: string
  date: string
  start_time: string
  end_time: string
  class_type: string
  max_capacity: number
  current_bookings: number
  is_available: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// Subscription Types (for SaaS model)
// ============================================================================
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise'

export type TrainerAccount = {
  id: string
  trainer_id: string
  subscription_plan: SubscriptionPlan
  is_active: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// API Request/Response Types
// ============================================================================
export type CreateReservationRequest = {
  trainer_id: string
  client_name: string
  client_phone: string
  client_email?: string
  session_date: string
  session_time: string
  class_type: string
}

export type CreateReservationResponse = {
  success: boolean
  data?: Reservation
  error?: string
}

export type GetAvailabilityRequest = {
  trainer_id: string
  date: string
  class_type?: string
}

export type GetAvailabilityResponse = {
  success: boolean
  data?: AvailabilitySlot[]
  error?: string
}
