import { getSupabaseServerClient } from '@/lib/supabase/client'
import { Trainer, TrainerRate } from '@/lib/domain/types'

export async function getAllTrainers(): Promise<Trainer[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return error ? [] : (data as Trainer[]) || []
}

export async function getTrainerById(id: string): Promise<Trainer | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .eq('id', id)
    .single()

  return error ? null : (data as Trainer)
}

export async function createTrainer(trainer: Omit<Trainer, 'id' | 'created_at' | 'updated_at'>): Promise<Trainer | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('trainers')
    .insert([trainer])
    .select()
    .single()

  return error ? null : (data as Trainer)
}

export async function updateTrainer(id: string, updates: Partial<Trainer>): Promise<Trainer | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('trainers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  return error ? null : (data as Trainer)
}

export async function deleteTrainer(id: string): Promise<boolean> {
  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('trainers')
    .delete()
    .eq('id', id)

  return !error
}

export async function getTrainerRates(trainerId: string): Promise<TrainerRate[]> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('trainer_rates')
    .select('*')
    .eq('trainer_id', trainerId)

  return error ? [] : (data as TrainerRate[]) || []
}

export async function setTrainerRate(
  trainerId: string,
  durationMinutes: number,
  pricePerClass: number,
  currency: string = 'USD'
): Promise<TrainerRate | null> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('trainer_rates')
    .insert([
      {
        trainer_id: trainerId,
        duration_minutes: durationMinutes,
        price_per_class: pricePerClass,
        currency,
      },
    ])
    .select()
    .single()

  return error ? null : (data as TrainerRate)
}
