import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/client'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const trainer_id = searchParams.get('trainer_id')
    const date = searchParams.get('date')

    if (!trainer_id || !date) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: trainer_id, date' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('trainer_id', trainer_id)
      .eq('session_date', date)
      .order('start_time', { ascending: true })

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
