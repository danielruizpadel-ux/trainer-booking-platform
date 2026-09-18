import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'

export async function POST() {
  try {
    const supabase = getSupabaseServerClient()

    const trainers = [
      {
        name: 'John Smith',
        email: 'john@example.com',
        phone: '555-0101',
        bio: 'Certified personal trainer with 10+ years experience',
        status: 'active',
        rating: 4.8,
        total_reviews: 45,
      },
      {
        name: 'Sarah Johnson',
        email: 'sarah@example.com',
        phone: '555-0102',
        bio: 'Yoga and Pilates specialist',
        status: 'active',
        rating: 4.9,
        total_reviews: 52,
      },
    ]

    const { data: trainersData, error: trainersError } = await supabase
      .from('trainers')
      .insert(trainers)
      .select()

    if (trainersError) {
      return NextResponse.json(
        { success: false, error: trainersError.message },
        { status: 500 }
      )
    }

    const clients = [
      {
        name: 'Alice Brown',
        email: 'alice@example.com',
        phone: '555-1001',
      },
      {
        name: 'Bob Wilson',
        email: 'bob@example.com',
        phone: '555-1002',
      },
    ]

    const { error: clientsError } = await supabase
      .from('clients')
      .insert(clients)

    if (clientsError) {
      return NextResponse.json(
        { success: false, error: clientsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      data: {
        trainers: trainersData?.length || 0,
        clients: clients.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
