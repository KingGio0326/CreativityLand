import { getSupabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = getSupabase();
  const body = await request.json();
  const { query, ticker } = body as { query: string; ticker?: string };

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // Call Python embedding service or use Supabase RPC directly
  // For now, do a text-based search as fallback and let the RPC handle vector search
  const { data, error } = await supabase.rpc("match_articles", {
    query_embedding: query,
    filter_ticker: ticker || null,
    match_count: 10,
  });

  if (error) {
    // Fallback to text search if vector search fails
    let fallbackQuery = supabase
      .from("articles")
      .select("*")
      .ilike("title", `%${query}%`)
      .order("published_at", { ascending: false })
      .limit(10);

    if (ticker) fallbackQuery = fallbackQuery.eq("ticker", ticker);
    const { data: fallbackData } = await fallbackQuery;
    return NextResponse.json(fallbackData ?? []);
  }

  return NextResponse.json(data);
}
