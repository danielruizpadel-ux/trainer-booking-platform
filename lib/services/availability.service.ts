import { getSupabaseServerClient } from '@/lib/supabase/client'
import { AvailabilitySlot } from '@/lib/domain/types'

export async function getAvailableSlots(
  trainerId: string,
  date: string
): Promise<AvailabilitySlot[]> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('trainer_id', trainerId)
      .eq('session_date', date)
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching availability slots:', error)
      return []
    }

    return (data || []) as AvailabilitySlot[]
  } catch (error) {
    console.error('Unexpected error in getAvailableSlots:', error)
    return []
  }
}

export async function getAvailableSlotsRange(
  trainerId: string,
  startDate: string,
  endDate: string
): Promise<AvailabilitySlot[]> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('trainer_id', trainerId)
      .gte('session_date', startDate)
      .lte('session_date', endDate)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching availability slots range:', error)
      return []
    }

    return (data || []) as AvailabilitySlot[]
  } catch (error) {
    console.error('Unexpected error in getAvailableSlotsRange:', error)
    return []
  }
}

export async function createAvailabilitySlot(
  slot: Omit<AvailabilitySlot, 'id' | 'created_at' | 'updated_at'>
): Promise<AvailabilitySlot | null> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('availability_slots')
      .insert([slot])
      .select()
      .single()

    if (error) {
      console.error('Error creating availability slot:', error)
      return null
    }

    return data as AvailabilitySlot
  } catch (error) {
    console.error('Unexpected error in createAvailabilitySlot:', error)
    return null
  }
}

export async function updateAvailabilitySlot(
  slotId: string,
  updates: Partial<Omit<AvailabilitySlot, 'id' | 'created_at' | 'updated_at'>>
): Promise<AvailabilitySlot | null> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('availability_slots')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', slotId)
      .select()
      .single()

    if (error) {
      console.error('Error updating availability slot:', error)
      return null
    }

    return data as AvailabilitySlot
  } catch (error) {
    console.error('Unexpected error in updateAvailabilitySlot:', error)
    return null
  }
}

export async function deleteAvailabilitySlot(slotId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient()

    const { error } = await supabase
      .from('availability_slots')
      .delete()
      .eq('id', slotId)

    if (error) {
      console.error('Error deleting availability slot:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Unexpected error in deleteAvailabilitySlot:', error)
    return false
  }
}
