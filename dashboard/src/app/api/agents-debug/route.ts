export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const ticker =
    request.nextUrl.searchParams.get("ticker")?.toUpperCase() ?? "AAPL";

  try {
    const [signalRes, articlesRes] = await Promise.all([
      supabase
        .from("signals")
        .select("*")
        .eq("ticker", ticker)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("articles")
        .select("*")
        .eq("ticker", ticker)
        .not("sentiment_label", "is", null)
        .order("published_at", { ascending: false })
        .limit(50),
    ]);

    if (signalRes.error) {
      return NextResponse.json(
        { error: signalRes.error.message },
        { status: 500 },
      );
    }
    if (articlesRes.error) {
      return NextResponse.json(
        { error: articlesRes.error.message },
        { status: 500 },
      );
    }

    const signal = signalRes.data?.[0] ?? null;
    const articles = articlesRes.data ?? [];

    // Parse reasoning
    let reasoning: string[] = [];
    if (signal?.reasoning) {
      reasoning =
        typeof signal.reasoning === "string"
          ? signal.reasoning.split(" | ")
          : Array.isArray(signal.reasoning)
            ? signal.reasoning
            : [];
    }

    // Article stats
    const distribution = { positive: 0, negative: 0, neutral: 0 };
    let sumContribution = 0;
    let sumWeight = 0;
    let articlesWithEmbedding = 0;

    for (const a of articles) {
      const label = a.sentiment_label as string;
      if (label in distribution) {
        distribution[label as keyof typeof distribution]++;
      }

      const publishedAt = a.published_at
        ? new Date(a.published_at as string)
        : new Date();
      const hoursAgo =
        (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
      const decayWeight = Math.exp(-hoursAgo / 24);
      const score = (a.sentiment_score as number) ?? 0;
      const direction =
        label === "positive" ? 1 : label === "negative" ? -1 : 0;

      sumContribution += score * direction * decayWeight;
      sumWeight += decayWeight;

      if (a.embedding != null) {
        articlesWithEmbedding++;
      }
    }

    const weightedScore =
      sumWeight > 0
        ? Math.round((sumContribution / sumWeight) * 10000) / 10000
        : 0;

    return NextResponse.json({
      ticker,
      signal: signal
        ? {
            signal: signal.signal,
            confidence: signal.confidence,
            created_at: signal.created_at,
            reasoning,
          }
        : null,
      stats: {
        total: articles.length,
        positive: distribution.positive,
        negative: distribution.negative,
        neutral: distribution.neutral,
        weighted_score: weightedScore,
        articles_with_embedding: articlesWithEmbedding,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
