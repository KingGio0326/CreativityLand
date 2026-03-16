import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { query, ticker } = body as { query: string; ticker?: string }

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    // Try vector search via RPC, fallback to text search
    const { data, error } = await supabase.rpc('match_articles', {
      query_embedding: query,
      filter_ticker: ticker || null,
      match_count: 10,
    })

    if (error) {
      // Fallback to text search
      let fallbackQuery = supabase
        .from('articles')
        .select('*')
        .ilike('title', `%${query}%`)
        .order('published_at', { ascending: false })
        .limit(10)

      if (ticker) fallbackQuery = fallbackQuery.eq('ticker', ticker)
      const { data: fallbackData } = await fallbackQuery
      return NextResponse.json(fallbackData ?? [])
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('Search API error:', err)
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    )
  }
}
