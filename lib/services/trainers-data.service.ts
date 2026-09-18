/**
 * Trainer Data Service
 * Handles fetching trainer data by slug from Supabase
 */

import { getSupabaseServerClient } from '@/lib/supabase/client'

export interface TrainerData {
  id: string
  slug: string
  name: string
  bio?: string
  email?: string
  phone?: string
  image_url?: string
  price?: number
  rating?: number
  total_reviews?: number
  specializations?: string[]
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
}

/**
 * Get trainer by slug
 * Returns trainer data or null if not found
 */
export async function getTrainerBySlug(slug: string): Promise<TrainerData | null> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('trainers')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .single()

    if (error || !data) {
      return null
    }

    return data as TrainerData
  } catch (error) {
    console.error('Error fetching trainer by slug:', error)
    return null
  }
}

/**
 * Get trainer by ID
 */
export async function getTrainerById(id: string): Promise<TrainerData | null> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('trainers')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single()

    if (error || !data) {
      return null
    }

    return data as TrainerData
  } catch (error) {
    console.error('Error fetching trainer by ID:', error)
    return null
  }
}

/**
 * Get all active trainers with ratings
 */
export async function getAllTrainers(): Promise<TrainerData[]> {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('trainers')
      .select('*')
      .eq('status', 'active')
      .order('rating', { ascending: false })

    if (error) {
      return []
    }

    return (data || []) as TrainerData[]
  } catch (error) {
    console.error('Error fetching trainers:', error)
    return []
  }
}
