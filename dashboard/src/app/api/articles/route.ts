import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ticker = searchParams.get('ticker')
    const sentiment = searchParams.get('sentiment')
    const page = parseInt(searchParams.get('page') ?? '1')
    const limit = parseInt(searchParams.get('limit') ?? '20')
    const offset = (page - 1) * limit

    let query = supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (ticker) query = query.eq('ticker', ticker)
    if (sentiment) query = query.eq('sentiment_label', sentiment)

    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    console.log('Articles found:', data?.length ?? 0)
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
