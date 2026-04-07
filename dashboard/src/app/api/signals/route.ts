import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const ticker = request.nextUrl.searchParams.get("ticker");
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

    let query = supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (ticker) {
      query = query.eq('ticker', ticker);
    }

    const { data, error } = await query;

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
