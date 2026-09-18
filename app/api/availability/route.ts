import { getSupabaseServerClient } from '@/lib/supabase/client'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const trainerId = searchParams.get('trainer_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    if (!trainerId || !startDate || !endDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters: trainer_id, start_date, end_date',
        },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('trainer_id', trainerId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_available', true)
      .order('date')
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
