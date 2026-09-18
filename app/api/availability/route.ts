import { getSupabaseServerClient } from '@/lib/supabase/client'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    let trainerId = searchParams.get('trainer_id')
    const date = searchParams.get('date')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    // Support both single date and date range queries
    if (!trainerId || (!date && (!startDate || !endDate))) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: trainer_id and (date OR start_date+end_date)',
        },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    // Check if trainerId looks like a UUID or a slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trainerId)

    let query = supabase.from('availability_slots').select('*')

    if (isUUID) {
      // Direct UUID lookup
      query = query.eq('trainer_id', trainerId)
    } else {
      // Slug lookup: join with trainers table
      const { data: trainerData, error: trainerError } = await supabase
        .from('trainers')
        .select('id')
        .eq('slug', trainerId)
        .single()

      if (trainerError || !trainerData) {
        return NextResponse.json(
          {
            success: false,
            error: 'Trainer not found',
          },
          { status: 404 }
        )
      }

      trainerId = trainerData.id
      query = query.eq('trainer_id', trainerId)
    }

    // Filter by single date or date range
    if (date) {
      query = query.eq('session_date', date)
    } else if (startDate && endDate) {
      query = query
        .gte('session_date', startDate)
        .lte('session_date', endDate)
    }

    const { data, error } = await query
      .order('session_date')
      .order('start_time')

    if (error) {
      console.error('Error fetching availability:', error)
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch availability',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    console.error('Availability API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}
