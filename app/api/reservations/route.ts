import { getSupabaseServerClient } from '@/lib/supabase/client'
import { NextRequest, NextResponse } from 'next/server'

interface ReservationRequest {
  trainer_id: string
  client_name: string
  client_email: string
  client_phone?: string | null
  date: string
  time: string
  notes?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body: ReservationRequest = await request.json()

    const {
      trainer_id,
      client_name,
      client_email,
      client_phone,
      date,
      time,
      notes,
    } = body

    // Validate required fields
    if (!trainer_id || !client_name || !client_email || !date || !time) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
        },
        { status: 400 }
      )
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client_email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email address',
        },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    // Create reservation
    const { error } = await supabase
      .from('reservations')
      .insert({
        trainer_id,
        client_name,
        client_email,
        client_phone: client_phone || null,
        date,
        time,
        notes: notes || null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating reservation:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create reservation',
        },
        { status: 500 }
      )
    }

    // Update availability - increment current_bookings
    // Note: Implementation of availability update may vary based on Supabase setup
    // await supabase
    //   .from('availability_slots')
    //   .update({ current_bookings: supabase.rpc('increment', { x: 1 }) })
    //   .eq('trainer_id', trainer_id)
    //   .eq('date', date)
    //   .eq('start_time', time)

    // TODO: Send confirmation email using Supabase Email API or Nodemailer
    // await sendReservationConfirmation(client_email, {
    //   trainerName,
    //   date,
    //   time,
    //   clientName: client_name,
    // })

    return NextResponse.json(
      {
        success: true,
        message: 'Reservation created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Reservations API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const trainerId = searchParams.get('trainer_id')
    const clientEmail = searchParams.get('client_email')

    const supabase = getSupabaseServerClient()

    let query = supabase.from('reservations').select('*')

    if (trainerId) {
      query = query.eq('trainer_id', trainerId)
    }

    if (clientEmail) {
      query = query.eq('client_email', clientEmail)
    }

    const { data, error } = await query.order('date', { ascending: false })

    if (error) {
      console.error('Error fetching reservations:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch reservations',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('Reservations API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}
