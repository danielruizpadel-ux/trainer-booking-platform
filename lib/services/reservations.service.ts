import { getSupabaseServerClient } from '@/lib/supabase/client'
import { Reservation } from '@/lib/domain/types'

export async function getAllReservations(): Promise<Reservation[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.from('reservations').select('*').order('session_date', { ascending: false })
  return error ? [] : (data as Reservation[]) || []
}

export async function getReservationsByTrainer(trainerId: string): Promise<Reservation[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('session_date', { ascending: false })
  return error ? [] : (data as Reservation[]) || []
}

export async function getReservationsByClient(clientId: string): Promise<Reservation[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('client_id', clientId)
    .order('session_date', { ascending: false })
  return error ? [] : (data as Reservation[]) || []
}

export async function getReservationsByEmail(clientEmail: string): Promise<Reservation[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('client_email', clientEmail)
    .order('date', { ascending: false })
  return error ? [] : (data as Reservation[]) || []
}

export async function createReservation(reservation: Omit<Reservation, 'id' | 'created_at' | 'updated_at'>): Promise<Reservation | null> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('reservations')
    .insert([{ ...reservation, status: 'confirmed' }])
    .select()
    .single()

  return error ? null : (data as Reservation)
}

export async function updateReservation(id: string, updates: Partial<Reservation>): Promise<Reservation | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return error ? null : (data as Reservation)
}

export async function cancelReservation(id: string, reason: string): Promise<Reservation | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reservations')
    .update({
      status: 'cancelled',
      notes: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  return error ? null : (data as Reservation)
}
