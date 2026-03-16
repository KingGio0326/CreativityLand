import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
